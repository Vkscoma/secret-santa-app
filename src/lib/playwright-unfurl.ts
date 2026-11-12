import { lookup as dnsLookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import serverlessChromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";
import { createPinnedProxy } from "@/lib/pinned-proxy";
import { isPublicAddress, normalizeUnfurlUrl, truncateHtmlToBytes, UNFURL_MAX_BYTES, UnfurlSafetyError } from "@/lib/unfurl";

const MAX_RENDER_MS = 20_000;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BLOCKED_HOSTS = /(?:google-analytics|googletagmanager|doubleclick|facebook\.net|hotjar|segment\.io|newrelic|optimizely)/i;
/**
 * Soft ceiling on bytes for the whole rendered asset graph (documents,
 * scripts, styles, XHR). Fonts, media and images are already blocked. Crossing
 * it stops further loading but keeps the DOM parsed so far, because preview
 * metadata lives in the server-rendered <head>. 20 MB lets script-driven
 * shells fetch their bundles; heavier storefronts simply stop early.
 */
export const RENDER_MAX_TOTAL_BYTES = 20_000_000;
/**
 * Hard backstop for bytes that keep streaming after a soft stop (in-flight
 * responses the browser did not cancel). Crossing it closes the page.
 */
export const RENDER_HARD_STOP_BYTES = 25_000_000;

/** A soft cap stops loading and keeps the partial DOM; it does not discard the render. */
export type RenderByteCap = "document_byte_cap" | "total_byte_cap";

export type RenderFailureReason =
  | RenderByteCap
  | "hard_byte_cap"
  | "timeout"
  | "launch_failed"
  | "navigation_failed"
  | "empty_content"
  | "render_error";

type ByteLimits = { documentBytes: number; totalBytes: number; hardStopBytes: number };

/**
 * Tracks bytes received during a render. The document cap applies only to the
 * main-frame document so heavy subresources (JS bundles, CSS) do not count
 * against the HTML limit; everything counts against the total ceiling. Each
 * limit is reported once, when it is first crossed.
 */
export function createRenderByteBudget(limits: ByteLimits) {
  const mainDocumentRequests = new Set<string>();
  const finishedRequests = new Set<string>();
  let documentBytes = 0;
  let totalBytes = 0;
  let softCap: RenderByteCap | null = null;
  let hardStopped = false;
  const crossed = (): RenderFailureReason | null => {
    if (!hardStopped && totalBytes > limits.hardStopBytes) { hardStopped = true; return "hard_byte_cap"; }
    if (softCap) return null;
    if (documentBytes > limits.documentBytes) softCap = "document_byte_cap";
    else if (totalBytes > limits.totalBytes) softCap = "total_byte_cap";
    return softCap;
  };
  return {
    trackRequest(requestId: string, isMainDocument: boolean): void {
      if (isMainDocument) mainDocumentRequests.add(requestId);
    },
    trackFinished(requestId: string): void {
      finishedRequests.add(requestId);
    },
    addBytes(requestId: string, bytes: number): RenderFailureReason | null {
      totalBytes += bytes;
      if (mainDocumentRequests.has(requestId)) documentBytes += bytes;
      return crossed();
    },
    /** A main document is never stopped up front: its first bytes hold the metadata. */
    checkContentLength(contentLength: number, isMainDocument: boolean): RenderFailureReason | null {
      if (isMainDocument || softCap || contentLength <= limits.totalBytes - totalBytes) return null;
      softCap = "total_byte_cap";
      return softCap;
    },
    /** The cap that stopped loading, if any; later requests must be aborted. */
    softCap: (): RenderByteCap | null => softCap,
    /** True when a soft stop may have cut the main document short. */
    documentIncomplete: (): boolean => softCap !== null && ![...mainDocumentRequests].some((id) => finishedRequests.has(id)),
    totals(): { documentBytes: number; totalBytes: number } {
      return { documentBytes, totalBytes };
    },
  };
}

// Hostname only in both messages: full URLs can carry query-string tokens.
function logRenderFailure(url: URL, reason: RenderFailureReason): void {
  console.warn(`[unfurl] Rendered preview unavailable for ${url.hostname}: ${reason}`);
}

function logRenderPartial(url: URL, cap: RenderByteCap | "html_truncated"): void {
  console.warn(`[unfurl] Rendered preview for ${url.hostname} hit ${cap}; returned partial content`);
}

export type RenderedPage = { html: string; finalUrl: string; statusCode: number | null; truncated?: boolean };
export type RenderPageDependencies = {
  lookup?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  executablePath?: string;
};

function localChromiumPath(override?: string): string | null {
  const candidates = [
    override,
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    playwrightChromium.executablePath(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function isSafeRequest(rawUrl: string, lookup: NonNullable<RenderPageDependencies["lookup"]>): Promise<boolean> {
  if (rawUrl === "about:blank" || /^(?:data|blob):/i.test(rawUrl)) return true;
  let url: URL;
  try { url = normalizeUnfurlUrl(rawUrl); } catch (error) {
    if (error instanceof UnfurlSafetyError) return false;
    return false;
  }
  try {
    const addresses = await lookup(url.hostname);
    return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));
  } catch { return false; }
}

/**
 * Render a page when guarded direct HTTP fetches produce a block or an empty
 * shell. Every browser request is intercepted and checked for public DNS so
 * rendered JavaScript cannot use the unfurl endpoint to reach private hosts.
 */
export async function renderUnfurlPage(rawUrl: URL, dependencies: RenderPageDependencies = {}): Promise<RenderedPage | null> {
  const lookup = dependencies.lookup ?? ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
  const localExecutable = localChromiumPath(dependencies.executablePath);
  const useServerlessBinary = !localExecutable;
  let browser: Awaited<ReturnType<typeof playwrightChromium.launch>> | null = null;
  let proxy: Awaited<ReturnType<typeof createPinnedProxy>> | null = null;
  let expired = false;
  let failureReason: RenderFailureReason | null = null;
  let partialReason: RenderByteCap | "html_truncated" | null = null;
  let launched = false;
  const render = async (): Promise<RenderedPage | null> => {
    const startUrl = normalizeUnfurlUrl(rawUrl.toString());
    const launchOptions = useServerlessBinary
      ? { args: serverlessChromium.args, executablePath: await serverlessChromium.executablePath(), headless: true }
      : { executablePath: localExecutable!, headless: true };
    if (expired) return null;
    proxy = await createPinnedProxy(lookup);
    if (expired) { await proxy.close(); proxy = null; return null; }
    browser = await playwrightChromium.launch({ ...launchOptions, timeout: MAX_RENDER_MS });
    if (expired) {
      await browser.close().catch(() => undefined);
      browser = null;
      return null;
    }
    const context = await browser.newContext({
      userAgent: BROWSER_UA,
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
      deviceScaleFactor: 1,
      isMobile: false,
      proxy: { server: proxy.url, bypass: "" },
    });
    const page = await context.newPage();
    launched = true;
    // Chromium can render scripts, but it must not consume an unbounded page or asset graph.
    const budget = createRenderByteBudget({ documentBytes: UNFURL_MAX_BYTES, totalBytes: RENDER_MAX_TOTAL_BYTES, hardStopBytes: RENDER_HARD_STOP_BYTES });
    const network = await context.newCDPSession(page);
    const enforceBudget = (reason: RenderFailureReason | null) => {
      if (!reason) return;
      if (reason === "hard_byte_cap") {
        failureReason ??= reason;
        void page.close().catch(() => undefined);
        return;
      }
      // Soft cap: stop the document and every pending load, keep what was parsed.
      // The route handler aborts anything requested afterwards.
      void network.send("Page.stopLoading").catch(() => undefined);
    };
    const { frameTree } = await network.send("Page.getFrameTree");
    const mainFrameId = frameTree.frame.id;
    await network.send("Network.enable");
    network.on("Network.requestWillBeSent", (event) => {
      budget.trackRequest(event.requestId, event.type === "Document" && event.frameId === mainFrameId);
    });
    network.on("Network.dataReceived", (event) => {
      enforceBudget(budget.addBytes(event.requestId, Math.max(event.dataLength, event.encodedDataLength)));
    });
    network.on("Network.loadingFinished", (event) => budget.trackFinished(event.requestId));
    // goto() rejects when a soft cap stops the load, so keep the main document's
    // own status (the last one, after redirects) from its response event.
    let mainDocumentStatus: number | null = null;
    page.on("response", (response) => {
      const request = response.request();
      const isMainDocument = request.isNavigationRequest() && request.frame() === page.mainFrame();
      if (isMainDocument) mainDocumentStatus = response.status();
      enforceBudget(budget.checkContentLength(Number(response.headers()["content-length"] ?? 0), isMainDocument));
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      let redirectCount = 0;
      for (let previous = request.redirectedFrom(); previous; previous = previous.redirectedFrom()) redirectCount += 1;
      if (budget.softCap() || redirectCount > 5 || /^(?:font|media|image)$/.test(request.resourceType()) || BLOCKED_HOSTS.test(requestUrl) || !(await isSafeRequest(requestUrl, lookup))) {
        await route.abort("blockedbyclient").catch(() => undefined);
        return;
      }
      await route.continue({ headers: { ...request.headers(), "user-agent": BROWSER_UA } });
    });
    let navigationFailed = false;
    const response = await page.goto(startUrl.toString(), { waitUntil: "domcontentloaded", timeout: 5_000 }).catch(() => {
      navigationFailed = true;
      return null;
    });
    const statusCode = response?.status() ?? mainDocumentStatus;
    await page.waitForFunction(
      () => Boolean(document.querySelector('script[type="application/ld+json"],meta[property="og:image"],h1')),
      undefined,
      { timeout: 5_000 },
    ).catch(() => undefined);
    await page.evaluate(() => window.scrollTo(0, Math.max(window.innerHeight, 800))).catch(() => undefined);
    await page.waitForTimeout(500).catch(() => undefined);
    const finalUrl = page.url();
    // A failed navigation leaves Chromium's own error page (chrome-error://), not the store's.
    if (navigationFailed && !/^https?:/i.test(finalUrl)) {
      failureReason ??= "navigation_failed";
      return null;
    }
    const content = await page.content().catch(() => "");
    const softCap = budget.softCap();
    if (!content) {
      failureReason ??= softCap ?? (navigationFailed ? "navigation_failed" : "empty_content");
      return null;
    }
    // The serialized DOM can outgrow the raw document, so bound it here too.
    const { html, truncated: htmlTruncated } = truncateHtmlToBytes(content, UNFURL_MAX_BYTES);
    partialReason = softCap ?? (htmlTruncated ? "html_truncated" : null);
    return { html, finalUrl, statusCode, truncated: htmlTruncated || budget.documentIncomplete() };
  };

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const rendered = await Promise.race([
      render(),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => { expired = true; failureReason ??= "timeout"; resolve(null); }, MAX_RENDER_MS);
      }),
    ]);
    if (!rendered) logRenderFailure(rawUrl, failureReason ?? "render_error");
    else if (partialReason) logRenderPartial(rawUrl, partialReason);
    return rendered;
  } catch {
    // A byte-cap close surfaces as a generic Playwright error, so prefer the recorded reason.
    logRenderFailure(rawUrl, failureReason ?? (launched ? "render_error" : "launch_failed"));
    return null;
  } finally {
    expired = true;
    if (timeout) clearTimeout(timeout);
    const activeBrowser = browser as Awaited<ReturnType<typeof playwrightChromium.launch>> | null;
    if (activeBrowser) await activeBrowser.close().catch(() => undefined);
    const activeProxy = proxy as Awaited<ReturnType<typeof createPinnedProxy>> | null;
    await activeProxy?.close().catch(() => undefined);
  }
}

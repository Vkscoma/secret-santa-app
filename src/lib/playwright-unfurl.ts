import { lookup as dnsLookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import serverlessChromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";
import { createPinnedProxy } from "@/lib/pinned-proxy";
import { isPublicAddress, normalizeUnfurlUrl, UnfurlSafetyError } from "@/lib/unfurl";

const MAX_RENDER_MS = 20_000;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BLOCKED_HOSTS = /(?:google-analytics|googletagmanager|doubleclick|facebook\.net|hotjar|segment\.io|newrelic|optimizely)/i;

export type RenderedPage = { html: string; finalUrl: string; statusCode: number | null };
export type RenderPageDependencies = {
  lookup?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  executablePath?: string;
};

function localChromiumPath(override?: string): string | null {
  const candidates = [
    override,
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
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
  const render = async (): Promise<RenderedPage | null> => {
    const startUrl = normalizeUnfurlUrl(rawUrl.toString());
    const launchOptions = useServerlessBinary
      ? { args: serverlessChromium.args, executablePath: await serverlessChromium.executablePath(), headless: true }
      : { executablePath: localExecutable!, headless: true };
    proxy = await createPinnedProxy(lookup);
    browser = await playwrightChromium.launch(launchOptions);
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
    await page.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      if (/^(?:font|media)$/.test(request.resourceType()) || BLOCKED_HOSTS.test(requestUrl) || !(await isSafeRequest(requestUrl, lookup))) {
        await route.abort("blockedbyclient").catch(() => undefined);
        return;
      }
      await route.continue({ headers: { ...request.headers(), "user-agent": BROWSER_UA } });
    });
    let statusCode: number | null = null;
    const response = await page.goto(startUrl.toString(), { waitUntil: "domcontentloaded", timeout: 5_000 }).catch(() => null);
    statusCode = response?.status() ?? null;
    await page.waitForFunction(
      () => Boolean(document.querySelector('script[type="application/ld+json"],meta[property="og:image"],h1')),
      undefined,
      { timeout: 5_000 },
    ).catch(() => undefined);
    await page.evaluate(() => window.scrollTo(0, Math.max(window.innerHeight, 800))).catch(() => undefined);
    await page.waitForTimeout(500).catch(() => undefined);
    const finalUrl = page.url();
    const html = await page.content().catch(() => "");
    return html ? { html, finalUrl, statusCode } : null;
  };

  const timeout = setTimeout(() => {
    expired = true;
    void (browser as Awaited<ReturnType<typeof playwrightChromium.launch>> | null)?.close().catch(() => undefined);
  }, MAX_RENDER_MS);
  try {
    return await Promise.race([
      render(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), MAX_RENDER_MS)),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    const activeBrowser = browser as Awaited<ReturnType<typeof playwrightChromium.launch>> | null;
    if (activeBrowser) await activeBrowser.close().catch(() => undefined);
    const activeProxy = proxy as Awaited<ReturnType<typeof createPinnedProxy>> | null;
    await activeProxy?.close().catch(() => undefined);
  }
}


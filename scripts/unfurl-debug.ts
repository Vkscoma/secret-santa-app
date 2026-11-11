import { renderUnfurlPage } from "@/lib/playwright-unfurl";
import { unfurlUrl, UnfurlSafetyError } from "@/lib/unfurl";

async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) {
    console.error("Usage: pnpm exec tsx scripts/unfurl-debug.ts <url> [url ...]");
    process.exitCode = 1;
    return;
  }
  for (const url of urls) {
    try {
      const metadata = await unfurlUrl(url, { render: renderUnfurlPage });
      console.log(JSON.stringify({
        requestedUrl: url,
        httpStatus: metadata.debug.httpStatus,
        finalUrl: metadata.debug.finalUrl,
        fetchPath: metadata.debug.fetchPath,
        challenge: metadata.debug.challenge,
        fieldSources: metadata.fieldSources,
        imageUrl: metadata.imageUrl,
        reason: metadata.reason,
      }, null, 2));
    } catch (error) {
      console.log(JSON.stringify({
        requestedUrl: url,
        error: error instanceof Error ? error.message : "Link preview failed.",
        reason: error instanceof UnfurlSafetyError ? "invalid_url" : "no_metadata",
      }, null, 2));
      process.exitCode = 1;
    }
  }
}

void main();

/**
 * Preview or test-send every notification email.
 *
 *   pnpm email:preview                      writes one HTML file per email to artifacts/email-previews/
 *   pnpm email:preview --to you@example.com  also sends each one to that address through Resend
 *
 * Sending needs RESEND_API_KEY and EMAIL_FROM in .env. Links in test emails are samples.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { EMAIL_KINDS, NotificationEmail, emailSubject, type EmailKind } from "../src/emails/notification";

const origin = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "https://example.com").replace(/\/$/, "");

function sampleProps(kind: EmailKind) {
  if (kind === "magic-link") return { kind, url: `${origin}/api/auth/magic-link/verify?token=sample-token-not-valid` };
  const url = kind === "empty-wishlist" || kind === "manual-nudge" ? `${origin}/wishlists` : `${origin}/`;
  return { kind, url, exchangeName: "Family Secret Santa 2026" };
}

async function main() {
  const toIndex = process.argv.indexOf("--to");
  const to = toIndex === -1 ? null : process.argv[toIndex + 1];
  if (toIndex !== -1 && !to) throw new Error("Pass an address after --to.");

  const outDir = path.join(process.cwd(), "artifacts", "email-previews");
  await mkdir(outDir, { recursive: true });

  const resend = to ? new Resend(process.env.RESEND_API_KEY) : null;
  const from = process.env.EMAIL_FROM;
  if (to && (!process.env.RESEND_API_KEY || !from)) throw new Error("Set RESEND_API_KEY and EMAIL_FROM in .env to send test emails.");

  for (const kind of EMAIL_KINDS) {
    const html = await render(createElement(NotificationEmail, sampleProps(kind)));
    const file = path.join(outDir, `${kind}.html`);
    await writeFile(file, html, "utf8");
    console.log(`Wrote ${file}`);
    if (resend && to && from) {
      const { error } = await resend.emails.send({ from, to: [to], subject: `[Test] ${emailSubject(kind)}`, html });
      console.log(error ? `  Could not send ${kind}: ${error.message}` : `  Sent ${kind} to ${to}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

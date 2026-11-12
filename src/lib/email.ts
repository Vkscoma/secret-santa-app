import { createElement } from "react";
import { Resend } from "resend";
import { NotificationEmail, emailSubject, type EmailKind } from "@/emails/notification";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email delivery is not configured.");
  return new Resend(apiKey);
}

export function appUrl(path = "/") {
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  if (!origin) throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  return new URL(path, origin).toString();
}

export async function deliverIdempotently<T, R = void>(input: {
  claim: () => Promise<T | null>;
  send: () => Promise<R>;
  markSent: (claim: T, result: R) => Promise<void>;
  markFailed: (claim: T, error: unknown) => Promise<void>;
}): Promise<"duplicate" | "sent" | "failed"> {
  const claim = await input.claim();
  if (claim === null) return "duplicate";
  try {
    const result = await input.send();
    await input.markSent(claim, result);
    return "sent";
  } catch (error) {
    await input.markFailed(claim, error);
    return "failed";
  }
}

export async function sendNotificationEmail(input: {
  to: string;
  kind: EmailKind;
  url: string;
  name?: string;
  exchangeName?: string;
  detail?: string;
  idempotencyKey?: string;
}) {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not configured.");
  const template = createElement(NotificationEmail, {
    kind: input.kind,
    url: input.url,
    ...(input.name ? { name: input.name } : {}),
    ...(input.exchangeName ? { exchangeName: input.exchangeName } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
  });
  const { data, error } = await getResend().emails.send(
    { from, to: [input.to], subject: emailSubject(input.kind), react: template },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
  );
  if (error) throw new Error(`Email provider rejected the message: ${error.message}`);
  return data;
}

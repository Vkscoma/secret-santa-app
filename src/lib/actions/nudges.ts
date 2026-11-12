"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { requireNonAdminExchangeMember } from "@/lib/authz";
import { db } from "@/lib/db";
import { assignments, exchanges, user } from "@/lib/schema";

const exchangeIdSchema = z.string().uuid();

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export async function nudgeRecipient(exchangeIdValue: string): Promise<{ ok: boolean; message: string }> {
  const parsed = exchangeIdSchema.safeParse(exchangeIdValue);
  if (!parsed.success) return { ok: false, message: "Could not send the reminder." };
  try {
    const session = await requireNonAdminExchangeMember(parsed.data);
    const [record] = await db.select({ recipientEmail: user.email, exchangeName: exchanges.name, status: exchanges.status })
      .from(assignments)
      .innerJoin(user, eq(assignments.receiverId, user.id))
      .innerJoin(exchanges, eq(assignments.exchangeId, exchanges.id))
      .where(and(eq(assignments.exchangeId, parsed.data), eq(assignments.giverId, session.user.id)))
      .limit(1);
    if (!record || record.status === "open" || record.status === "closed" || !record.recipientEmail) {
      return { ok: false, message: "Your recipient can’t be nudged right now." };
    }
    if (!(await consumeAuthRateLimit(`wishlist-nudge:${session.user.id}:${parsed.data}`))) {
      return { ok: false, message: "Please wait before sending another reminder." };
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) return { ok: false, message: "Email reminders aren’t configured yet." };
    const baseUrl = (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    if (!baseUrl) return { ok: false, message: "Email reminders aren’t configured yet." };
    const wishlistUrl = `${baseUrl}/wishlists/${parsed.data}`;
    const safeExchange = escapeHtml(record.exchangeName);
    const safeUrl = escapeHtml(wishlistUrl);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>A little Secret Santa reminder</title></head><body style="margin:0;padding:0;background-color:#f3f7f4;color:#23372f;font-family:Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">A friendly reminder to add a few gift ideas to your wish list.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f3f7f4;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #e1e9e3;border-radius:16px;overflow:hidden;"><tr><td align="center" style="padding:22px 28px;background-color:#174d3b;border-bottom:3px solid #d7ad55;"><p style="margin:0;color:#f4dfad;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:2px;">A LITTLE HOLIDAY MAGIC</p><p style="margin:7px 0 0;color:#ffffff;font-size:21px;line-height:28px;font-weight:bold;">Secret Santa</p></td></tr><tr><td style="padding:36px 36px 30px;"><p style="margin:0 0 10px;color:#63766b;font-size:13px;line-height:20px;">${safeExchange}</p><h1 style="margin:0 0 14px;color:#20382d;font-size:28px;line-height:36px;font-weight:700;">Add a few gift ideas</h1><p style="margin:0 0 26px;color:#53645a;font-size:16px;line-height:25px;">A little reminder to add the gifts you’d love to receive to your Secret Santa wish list. It’ll help your Secret Santa find something that feels just right.</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 24px;"><tr><td align="center" bgcolor="#a9363b" style="border-radius:9px;background-color:#a9363b;"><a href="${safeUrl}" style="display:inline-block;padding:15px 28px;border:1px solid #a9363b;border-radius:9px;color:#ffffff;font-size:16px;line-height:20px;font-weight:bold;text-decoration:none;">Open your wish list</a></td></tr></table></td></tr><tr><td style="padding:20px 36px 24px;border-top:1px solid #e7eee8;background-color:#f8faf8;"><p style="margin:0;color:#6b786f;font-size:12px;line-height:19px;text-align:center;">This is a friendly reminder from your Secret Santa exchange. No reply is needed.</p><p style="margin:12px 0 0;color:#87938b;font-size:11px;line-height:17px;text-align:center;">Made for the people you love, and the little surprises in between.</p></td></tr></table><p style="margin:18px 0 0;color:#8b978f;font-size:11px;line-height:17px;text-align:center;">Secret Santa · A thoughtful surprise is on its way.</p></td></tr></table></body></html>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [record.recipientEmail], subject: "A little Secret Santa reminder", html, text: `${record.exchangeName}\n\nA little reminder to add the gifts you’d love to receive to your Secret Santa wish list.\n\nOpen your wish list: ${wishlistUrl}\n\nThis is a friendly reminder from your Secret Santa exchange. No reply is needed.` }) });
    if (!response.ok) return { ok: false, message: "The reminder couldn’t be sent. Please try again later." };
    return { ok: true, message: "Your recipient has been nudged by email." };
  } catch {
    return { ok: false, message: "The reminder couldn’t be sent. Please try again later." };
  }
}

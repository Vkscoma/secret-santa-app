import { timingSafeEqual } from "node:crypto";
import { runNotificationSchedule } from "@/lib/notification-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runNotificationSchedule());
  } catch (error) {
    console.error("Notification cron failed", error);
    return Response.json({ error: "Notification processing failed" }, { status: 500 });
  }
}

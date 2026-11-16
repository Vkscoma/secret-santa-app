import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isSuperAdminEmail } from "@/lib/auth-access";
import { db } from "@/lib/db";
import { assignments, auditLog, exchanges, user } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteProps = { params: Promise<{ id: string }> };

function noStoreHeaders(contentType = "text/html; charset=utf-8") {
  return {
    "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  };
}

function errorResponse(message: string, status: number) {
  const body = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pairings unavailable</title><body><main><h1>Pairings unavailable</h1><p>${escapeHtml(message)}</p><p><a href="/admin">Return to administration</a></p></main></body></html>`;
  return new Response(body, { status, headers: noStoreHeaders() });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function getSuperAdminSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { response: errorResponse("Sign in with the Super Admin account to view pairings.", 401) } as const;
  if (!isSuperAdminEmail(session.user.email)) {
    return { response: errorResponse("Only the Super Admin can view pairings privately.", 403) } as const;
  }
  return { session } as const;
}

export async function POST(request: Request, { params }: RouteProps) {
  const { id } = await params;
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return errorResponse("This exchange could not be found.", 404);

  const authResult = await getSuperAdminSession(request);
  if ("response" in authResult) return authResult.response;
  const exchangeId = parsedId.data;

  if (!isSameOrigin(request)) return errorResponse("This request could not be verified. Return to the exchange page and try again.", 403);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("This request could not be read. Return to the exchange page and try again.", 400);
  }

  if (formData.get("exchangeId") !== exchangeId) return errorResponse("This exchange could not be verified.", 400);
  const mode = formData.get("mode");
  if (mode === "hide") {
    return new Response(null, {
      status: 303,
      headers: { ...noStoreHeaders(), Location: new URL(`/admin/exchanges/${exchangeId}#danger-zone`, request.url).toString() },
    });
  }
  if (mode !== "show" || formData.get("confirmPrivateView") !== "on") {
    return errorResponse("Confirm that you understand this will spoil your own surprise before viewing the pairings.", 400);
  }

  let exchange: { name: string; status: "open" | "drawn" | "revealed" | "closed" } | undefined;
  let pairings: { giverName: string | null; giverFullName: string; receiverName: string | null; receiverFullName: string }[];
  try {
    [exchange] = await db.select({ name: exchanges.name, status: exchanges.status }).from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
    if (!exchange) return errorResponse("This exchange could not be found.", 404);
    if (exchange.status !== "drawn") return errorResponse("Private viewing is available only after names are drawn and before the public reveal.", 409);

    const giver = alias(user, "private_pairing_giver");
    const receiver = alias(user, "private_pairing_receiver");
    pairings = await db.select({
      giverName: giver.displayName,
      giverFullName: giver.name,
      receiverName: receiver.displayName,
      receiverFullName: receiver.name,
    })
      .from(assignments)
      .innerJoin(giver, eq(assignments.giverId, giver.id))
      .innerJoin(receiver, eq(assignments.receiverId, receiver.id))
      .where(eq(assignments.exchangeId, exchangeId));

    // Do not add names or assignment data to audit metadata.
    await db.insert(auditLog).values({
      actorId: authResult.session.user.id,
      action: "exchange.pairings_viewed_privately",
      targetType: "exchange",
      targetId: exchangeId,
      metadata: {},
    });
  } catch {
    return errorResponse("We couldn’t open the private pairings just now. Return to the exchange page and try again.", 500);
  }

  const title = escapeHtml(exchange.name);
  const rows = pairings.map(({ giverName, giverFullName, receiverName, receiverFullName }) => {
    const giverLabel = escapeHtml(giverName?.trim() || giverFullName?.trim() || "Participant");
    const receiverLabel = escapeHtml(receiverName?.trim() || receiverFullName?.trim() || "Participant");
    return `<li><strong>${giverLabel}</strong><span aria-hidden="true">shops for</span><strong>${receiverLabel}</strong></li>`;
  }).join("");
  const content = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Private pairings · ${title}</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:Canvas;color:CanvasText}*{box-sizing:border-box}body{margin:0;padding:clamp(1rem,4vw,2.5rem)}main{width:min(100%,48rem);margin:0 auto}header{margin-bottom:1.5rem}h1{font-size:clamp(1.7rem,6vw,2.5rem);line-height:1.1;margin:0 0 .6rem}p{line-height:1.55}ul{list-style:none;padding:0;margin:1.5rem 0;display:grid;gap:.75rem}li{border:1px solid ButtonBorder;border-radius:.75rem;padding:1rem;display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap}li span{color:GrayText;font-size:.9rem}button{font:inherit;font-weight:650;min-height:2.75rem;padding:.65rem 1rem;border:1.5px solid ButtonBorder;border-radius:.75rem;background:transparent;color:CanvasText;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid Highlight;outline-offset:3px}button:hover{background:ButtonFace}small{color:GrayText}
</style></head><body><main><header><p><strong>Private Super Admin view</strong></p><h1>${title}</h1><p>This private page isn’t shared with participants. Close it or use Hide to put the pairings away. Each private view is noted in the admin activity log.</p></header>
${pairings.length ? `<ul aria-label="Secret Santa pairings">${rows}</ul>` : "<p>No pairings were found for this exchange.</p>"}
<form method="post" action="/api/admin/exchanges/${encodeURIComponent(exchangeId)}/private-pairings"><input type="hidden" name="exchangeId" value="${escapeHtml(exchangeId)}"><button type="submit" name="mode" value="hide">Hide pairings and return</button></form></main></body></html>`;

  return new Response(content, { status: 200, headers: noStoreHeaders() });
}

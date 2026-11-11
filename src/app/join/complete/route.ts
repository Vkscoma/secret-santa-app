import { headers, cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PENDING_INVITE_COOKIE, PENDING_INVITE_STATE_COOKIE } from "@/lib/auth-access";
import { consumeInviteCallback } from "@/lib/invite-callback-store";
import { canUseInvite, redeemInviteForUser } from "@/lib/invites";
import { safeReturnTo } from "@/lib/safe-return-to";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const cookieStore = await cookies();
  const query = new URL(request.url).searchParams;
  const callbackToken = query.get("invite");
  const callbackProof = query.get("proof");
  const callbackState = query.get("state");
  if (callbackToken && (!callbackProof || !session)) {
    return NextResponse.redirect(new URL("/not-allowed", request.url));
  }
  const token = callbackToken ?? cookieStore.get(PENDING_INVITE_COOKIE)?.value;
  const expectedState = cookieStore.get(PENDING_INVITE_STATE_COOKIE)?.value;
  if (!callbackToken && (!callbackState || !expectedState || callbackState !== expectedState)) {
    return NextResponse.redirect(new URL("/not-allowed", request.url));
  }
  if (!session || !token) return NextResponse.redirect(new URL("/not-allowed", request.url));
  try {
    if (!(await canUseInvite(token))) throw new Error("Invite is no longer available.");
    if (callbackToken && callbackProof && !await consumeInviteCallback(callbackToken, session.user.email, callbackProof)) {
      throw new Error("This invite callback has already been used.");
    }
    const result = await redeemInviteForUser({ token, userId: session.user.id, email: session.user.email });
    cookieStore.delete(PENDING_INVITE_COOKIE);
    cookieStore.delete(PENDING_INVITE_STATE_COOKIE);
    const destination = new URL("/join/result", request.url);
    destination.searchParams.set("outcome", result.outcome);
    const returnTo = safeReturnTo(query.get("returnTo"));
    if (returnTo !== "/dashboard") destination.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(destination);
  } catch {
    cookieStore.delete(PENDING_INVITE_COOKIE);
    cookieStore.delete(PENDING_INVITE_STATE_COOKIE);
    return NextResponse.redirect(new URL("/not-allowed", request.url));
  }
}

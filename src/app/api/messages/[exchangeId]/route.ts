import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireNonAdminExchangeMember } from "@/lib/authz";
import { db } from "@/lib/db";
import { messageThreadPayload } from "@/lib/message-payload";
import { assignments, exchanges, messages, user } from "@/lib/schema";

const bodySchema = z.object({ body: z.string().trim().min(1).max(1000) });
type Context = { params: Promise<{ exchangeId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { exchangeId } = await params;
    const session = await requireNonAdminExchangeMember(exchangeId);
    const [assignment] = await db.select({ id: assignments.id, giverId: assignments.giverId, receiverId: assignments.receiverId, status: exchanges.status })
      .from(assignments).innerJoin(exchanges, eq(assignments.exchangeId, exchanges.id))
      .where(and(eq(assignments.exchangeId, exchangeId), sql`(${assignments.giverId} = ${session.user.id} or ${assignments.receiverId} = ${session.user.id})`)).limit(1);
    if (!assignment) return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    const viewerRole = assignment.giverId === session.user.id ? "giver" : "recipient";
    const [partner] = viewerRole === "giver" && assignment.status === "revealed"
      ? await db.select({ displayName: user.displayName, name: user.name }).from(user).where(eq(user.id, assignment.receiverId)).limit(1)
      : [];
    const rows = await db.select({ id: messages.id, senderRole: messages.senderRole, body: messages.body, sentAt: messages.sentAt, readAt: messages.readAt })
      .from(messages).where(eq(messages.assignmentId, assignment.id)).orderBy(asc(messages.sentAt));
    await db.update(messages).set({ readAt: new Date() }).where(and(eq(messages.assignmentId, assignment.id), ne(messages.senderRole, viewerRole), isNull(messages.readAt)));
    return NextResponse.json(messageThreadPayload(viewerRole, viewerRole === "giver" ? (partner?.displayName || partner?.name || "your recipient") : "your Secret Santa", rows));
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "Forbidden";
    return NextResponse.json({ error: forbidden ? "You cannot access this conversation." : "Could not load this conversation." }, { status: forbidden ? 403 : 500 });
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { exchangeId } = await params;
    const session = await requireNonAdminExchangeMember(exchangeId);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Messages must contain 1 to 1000 characters." }, { status: 400 });
    const [assignment] = await db.select({ id: assignments.id, giverId: assignments.giverId })
      .from(assignments).where(and(eq(assignments.exchangeId, exchangeId), sql`(${assignments.giverId} = ${session.user.id} or ${assignments.receiverId} = ${session.user.id})`)).limit(1);
    if (!assignment) return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    const [recent] = await db.select({ count: sql<number>`count(*)::int` }).from(messages)
      .where(and(eq(messages.assignmentId, assignment.id), eq(messages.senderRole, assignment.giverId === session.user.id ? "giver" : "recipient"), sql`${messages.sentAt} > now() - interval '1 minute'`));
    if ((recent?.count ?? 0) >= 10) return NextResponse.json({ error: "Please wait a moment before sending another message." }, { status: 429 });
    const [created] = await db.insert(messages).values({ assignmentId: assignment.id, senderRole: assignment.giverId === session.user.id ? "giver" : "recipient", body: parsed.data.body }).returning({ id: messages.id });
    if (!created) return NextResponse.json({ error: "Could not send message." }, { status: 500 });
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "Forbidden";
    return NextResponse.json({ error: forbidden ? "You cannot access this conversation." : "Could not send message." }, { status: forbidden ? 403 : 500 });
  }
}

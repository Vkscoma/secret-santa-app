import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { MessageThread } from "@/components/secret-santa/message-thread";
import { PageHeading } from "@/components/secret-santa/components";
import { Card } from "@/components/ui/card";
import { requireExchangeMember } from "@/lib/authz";
import { db } from "@/lib/db";
import { assignments, exchanges } from "@/lib/schema";

export default async function MessagePage({ params }: { params: Promise<{ exchangeId: string }> }) {
  const { exchangeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(exchangeId)) notFound();
  const session = await requireExchangeMember(exchangeId);
  const [record] = await db.select({ name: exchanges.name, assignmentId: assignments.id })
    .from(assignments).innerJoin(exchanges, eq(assignments.exchangeId, exchanges.id))
    .where(and(eq(assignments.exchangeId, exchangeId), sql`(${assignments.giverId} = ${session.user.id} or ${assignments.receiverId} = ${session.user.id})`)).limit(1);
  return <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6 sm:py-12">
    <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Home</Link>
    <PageHeading eyebrow={record?.name ?? "Secret Santa"} title="Your private conversation" description="Messages stay between you and your assigned person." />
    {record ? <MessageThread exchangeId={exchangeId} /> : <Card className="p-6 text-center text-sm text-muted-foreground">Your conversation will be available after names are drawn.</Card>}
  </div>;
}

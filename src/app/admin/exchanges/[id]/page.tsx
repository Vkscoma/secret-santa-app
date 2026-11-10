import Link from "next/link";
import { notFound } from "next/navigation";
import { count, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeft, CalendarDays, Gift, Users } from "lucide-react";
import { z } from "zod";
import { InviteCreateForm } from "@/app/admin/invite-create-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  closeExchange,
  addAllowlistEntry,
  drawExchange,
  redrawExchange,
  requestExchangeReminders,
  revealExchange,
  revokeExchangeInvite,
  setExchangeExclusions,
  setExchangeParticipants,
  updateExchange,
} from "@/lib/actions/admin";
import { getUsersEligibleForExchange } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { utcToLocalInput } from "@/lib/exchange-time";
import {
  assignments,
  exchangeParticipants,
  exchanges,
  exclusions,
  inviteLinks,
  inviteRedemptions,
  user,
} from "@/lib/schema";

type PageProps = { params: Promise<{ id: string }> };

function formatDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export default async function AdminExchangePage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, id)).limit(1);
  if (!exchange) notFound();

  const [eligibleUsers, participantRows, exclusionRows, inviteRows] = await Promise.all([
    getUsersEligibleForExchange(id),
    db.select({ userId: exchangeParticipants.userId }).from(exchangeParticipants).where(eq(exchangeParticipants.exchangeId, id)),
    db.select({ giverId: exclusions.giverId, receiverId: exclusions.receiverId }).from(exclusions).where(eq(exclusions.exchangeId, id)),
    db.select({
      id: inviteLinks.id,
      createdAt: inviteLinks.createdAt,
      expiresAt: inviteLinks.expiresAt,
      maxUses: inviteLinks.maxUses,
      revokedAt: inviteLinks.revokedAt,
    }).from(inviteLinks).where(eq(inviteLinks.exchangeId, id)).orderBy(desc(inviteLinks.createdAt)),
  ]);
  const participantIds = new Set(participantRows.map(({ userId }) => userId));
  const excludedPairs = new Set(exclusionRows.map(({ giverId, receiverId }) => `${giverId}\0${receiverId}`));

  const inviteUsage = inviteRows.length
    ? await db.select({ inviteLinkId: inviteRedemptions.inviteLinkId, uses: count() })
      .from(inviteRedemptions)
      .where(inArray(inviteRedemptions.inviteLinkId, inviteRows.map(({ id: inviteId }) => inviteId)))
      .groupBy(inviteRedemptions.inviteLinkId)
    : [];
  const usesByInvite = new Map(inviteUsage.map(({ inviteLinkId, uses }) => [inviteLinkId, Number(uses)]));

  // Assignments are deliberately not queried until the exchange is revealed.
  const giverUser = alias(user, "giver_user");
  const receiverUser = alias(user, "receiver_user");
  const hasRevealedAssignments = exchange.status === "revealed" || exchange.status === "closed";
  const revealedAssignments = hasRevealedAssignments
    ? await db.select({
        giverId: assignments.giverId,
        giverName: giverUser.name,
        giverEmail: giverUser.email,
        receiverName: receiverUser.name,
        receiverEmail: receiverUser.email,
      })
      .from(assignments)
      .innerJoin(giverUser, eq(assignments.giverId, giverUser.id))
      .innerJoin(receiverUser, eq(assignments.receiverId, receiverUser.id))
      .where(eq(assignments.exchangeId, id))
    : [];

  const isOpen = exchange.status === "open";
  const canRedraw = exchange.status === "drawn" || exchange.status === "revealed";
  const currentLocalDate = utcToLocalInput(exchange.exchangeAt, exchange.timeZone);

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to administration
      </Link>

      <header className="panel-pattern relative overflow-hidden rounded-2xl bg-pine p-6 text-pine-foreground shadow-md sm:p-8">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-pine-foreground/80"><CalendarDays className="size-4" /> Exchange administration</div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{exchange.name}</h1>
            <p className="mt-2 text-sm text-pine-foreground/80">{formatDate(exchange.exchangeAt, exchange.timeZone)} · {exchange.timeZone}</p>
          </div>
          <Badge variant="secondary" className="w-fit border-pine-foreground/20 bg-pine-foreground/10 px-3 py-1 capitalize text-pine-foreground">{exchange.status}</Badge>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Exchange summary">
        <Card className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-pine"><Users className="size-5" /></span><span><strong className="block text-xl">{participantRows.length}</strong><span className="text-sm text-muted-foreground">Participants</span></span></Card>
        <Card className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Gift className="size-5" /></span><span><strong className="block text-xl">{exchange.budgetMin === null && exchange.budgetMax === null ? "—" : `$${exchange.budgetMin ?? 0}–$${exchange.budgetMax ?? "∞"}`}</strong><span className="text-sm text-muted-foreground">Gift budget</span></span></Card>
        <Card className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-gold/20 text-gold-foreground"><CalendarDays className="size-5" /></span><span><strong className="block text-xl">{exchange.year}</strong><span className="text-sm text-muted-foreground">Exchange year</span></span></Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <Card className="space-y-5 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">Participants</h2><p className="text-sm text-muted-foreground">Select accounts eligible through the global allowlist, this exchange, or a redeemed invitation.</p></div>
          {isOpen ? <form action={setExchangeParticipants} className="space-y-4">
            <input type="hidden" name="exchangeId" value={id} />
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
              {eligibleUsers.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                <input type="checkbox" name="participantId" value={person.id} defaultChecked={participantIds.has(person.id)} className="size-4 accent-primary" />
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{person.name}</strong><span className="block truncate text-xs text-muted-foreground">{person.email}</span></span>
                {person.role === "admin" && <Badge variant="outline">Admin</Badge>}
              </label>)}
              {!eligibleUsers.length && <p className="p-2 text-sm text-muted-foreground">No eligible accounts yet. Add people to the global allowlist or create an invite.</p>}
            </div>
            <p className="text-xs text-muted-foreground">At least two participants are needed to draw names.</p>
            <Button type="submit" variant="outline">Save participants</Button>
          </form> : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Participants are locked after the draw.</p>}
        </Card>

        <Card className="space-y-5 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">Exchange settings</h2><p className="text-sm text-muted-foreground">Date, time zone, budget, and notes.</p></div>
          {isOpen ? <form action={updateExchange} className="grid gap-3">
            <input type="hidden" name="exchangeId" value={id} />
            <label className="grid gap-1 text-sm font-medium">Name<Input name="name" required minLength={2} maxLength={100} defaultValue={exchange.name} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-medium">Year<Input name="year" type="number" min="2020" max="2200" defaultValue={exchange.year} /></label>
              <label className="grid gap-1 text-sm font-medium">Time zone<Input name="timeZone" required defaultValue={exchange.timeZone} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-medium">Budget min ($)<Input name="budgetMin" type="number" min="0" defaultValue={exchange.budgetMin ?? ""} /></label>
              <label className="grid gap-1 text-sm font-medium">Budget max ($)<Input name="budgetMax" type="number" min="0" defaultValue={exchange.budgetMax ?? ""} /></label>
            </div>
            <label className="grid gap-1 text-sm font-medium">Date and time<Input name="exchangeAt" type="datetime-local" required defaultValue={currentLocalDate} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoReveal" defaultChecked={exchange.autoReveal} className="size-4 accent-primary" />Enable automatic reveal preference</label>
            <label className="grid gap-1 text-sm font-medium">Notes<Textarea name="notes" rows={3} defaultValue={exchange.notes ?? ""} maxLength={2000} /></label>
            <Button type="submit" variant="outline">Save settings</Button>
          </form> : <dl className="space-y-3 text-sm">
            <div><dt className="text-muted-foreground">Budget</dt><dd className="font-semibold">{exchange.budgetMin === null && exchange.budgetMax === null ? "Not set" : `$${exchange.budgetMin ?? 0}–$${exchange.budgetMax ?? "∞"}`}</dd></div>
            <div><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap font-medium">{exchange.notes || "No notes"}</dd></div>
          </dl>}
        </Card>
      </section>

      <Card className="space-y-5 p-5 sm:p-6">
        <div><h2 className="text-xl font-bold">Exclusion rules</h2><p className="text-sm text-muted-foreground">Block specific giver → recipient pairings. Self-assignment is always forbidden.</p></div>
        {isOpen ? <form action={setExchangeExclusions} className="space-y-4">
          <input type="hidden" name="exchangeId" value={id} />
          {participantRows.length < 2 ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Choose at least two participants to manage exclusions.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {eligibleUsers.filter((person) => participantIds.has(person.id)).map((giver) => <fieldset key={giver.id} className="rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-semibold">{giver.name} cannot draw</legend>
              <div className="mt-2 space-y-1.5">
                {eligibleUsers.filter((receiver) => participantIds.has(receiver.id) && receiver.id !== giver.id).map((receiver) => {
                  const key = `${giver.id}\0${receiver.id}`;
                  return <label key={receiver.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="exclusion" value={JSON.stringify([giver.id, receiver.id])} defaultChecked={excludedPairs.has(key)} className="size-4 accent-primary" /><span>{receiver.name}</span></label>;
                })}
              </div>
            </fieldset>)}
          </div>}
          <Button type="submit" variant="outline">Save exclusions</Button>
        </form> : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Exclusion rules are locked after the draw.</p>}
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5 sm:p-6">
          <div><h2 className="text-lg font-bold">Add an individual</h2><p className="text-sm text-muted-foreground">Allow this address to join this exchange without opening access to other years.</p></div>
          {isOpen ? <form action={addAllowlistEntry} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="exchangeId" value={id} />
            <label className="sr-only" htmlFor="exchange-allowlist-email">Email address</label>
            <Input id="exchange-allowlist-email" name="email" type="email" required placeholder="friend@example.com" className="min-w-0 flex-1" />
            <Button type="submit">Add to exchange</Button>
          </form> : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">This exchange is locked after the draw.</p>}
        </Card>
        <InviteCreateForm exchangeId={id} />
        <Card className="space-y-4 p-5 sm:p-6">
          <div><h2 className="text-lg font-bold">Invitation links</h2><p className="text-sm text-muted-foreground">Invite tokens are stored as hashes. Revoked and expired links remain listed for the audit trail.</p></div>
          {inviteRows.length ? <div className="space-y-2">{inviteRows.map((invite) => {
            const uses = usesByInvite.get(invite.id) ?? 0;
            const expired = Boolean(invite.expiresAt && invite.expiresAt <= new Date());
            const exhausted = invite.maxUses !== null && uses >= invite.maxUses;
            return <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div><p className="text-sm font-semibold">{uses}{invite.maxUses === null ? " uses" : ` / ${invite.maxUses} uses`}</p><p className="text-xs text-muted-foreground">{invite.revokedAt ? "Revoked" : expired ? "Expired" : exhausted ? "Limit reached" : "Active"}{invite.expiresAt ? ` · expires ${formatDate(invite.expiresAt, exchange.timeZone)}` : " · no expiry"}</p></div>
              {!invite.revokedAt && !expired && !exhausted && <form action={revokeExchangeInvite}><input type="hidden" name="inviteId" value={invite.id} /><Button size="sm" variant="outline">Revoke</Button></form>}
            </div>;
          })}</div> : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No invitation links created yet.</p>}
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="space-y-4 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">Draw and reveal</h2><p className="text-sm text-muted-foreground">The assignment map stays hidden from admin views until the exchange is explicitly revealed.</p></div>
          {isOpen && <form action={drawExchange}><input type="hidden" name="exchangeId" value={id} /><Button type="submit" disabled={participantRows.length < 2}><Gift className="size-4" /> Draw names</Button></form>}
          {canRedraw && <form action={redrawExchange} className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <input type="hidden" name="exchangeId" value={id} />
            <div><h3 className="font-bold text-destructive">Redraw this exchange</h3><p className="mt-1 text-sm text-muted-foreground">This replaces every assignment and clears anonymous message threads for this exchange. Participants will need to start over.</p></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmRedraw" required className="mt-1 size-4 accent-primary" /><span>I understand this replaces the draw and clears its message threads.</span></label>
            <Button type="submit" variant="destructive">Confirm redraw</Button>
          </form>}
          {exchange.status === "drawn" && <form action={revealExchange} className="space-y-3 rounded-xl border border-gold/50 bg-gold/10 p-4">
            <input type="hidden" name="exchangeId" value={id} />
            <div><h3 className="font-bold">Reveal assignments</h3><p className="mt-1 text-sm text-muted-foreground">This reveal is recorded in the audit log. Participants will be able to see who their Secret Santa is.</p></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmReveal" required className="mt-1 size-4 accent-primary" /><span>I’m ready to reveal the assignment mappings.</span></label>
            <Button type="submit">Reveal assignments</Button>
          </form>}
          {exchange.status === "revealed" && <div className="rounded-xl bg-secondary p-4 text-sm font-semibold text-secondary-foreground">Assignments have been revealed and logged.</div>}
          {exchange.status === "revealed" && <form action={closeExchange}><input type="hidden" name="exchangeId" value={id} /><Button type="submit" variant="outline">Close exchange</Button></form>}
          {exchange.status === "closed" && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">This exchange is closed. Its assignments remain available in history.</p>}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">Assignment summary</h2><p className="text-sm text-muted-foreground">Recipient mappings appear here only after an audited reveal.</p></div>
          {hasRevealedAssignments ? revealedAssignments.length ? <div className="divide-y divide-border">{revealedAssignments.map((pair) => {
            return <div key={pair.giverId} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="min-w-0 truncate font-semibold">{pair.giverName}</span>
              <span className="text-muted-foreground">→</span>
              <span className="min-w-0 truncate text-right">{pair.receiverName}</span>
            </div>;
          })}</div> : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No saved assignment mappings were found.</p> : <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center"><div><Gift className="mx-auto size-8 text-primary" /><p className="mt-2 font-semibold">Mappings remain secret</p><p className="mt-1 text-sm text-muted-foreground">The admin view won’t query assignments until the exchange is revealed.</p></div></div>}
        </Card>
      </section>

      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:p-6">
        <div><h2 className="font-bold">Reminders</h2><p className="text-sm text-muted-foreground">Send exchange reminders now through Resend. People who turned reminders off are skipped. Delivery history will be available in Wave 6.</p></div>
        {exchange.status !== "closed" && <form action={requestExchangeReminders}><input type="hidden" name="exchangeId" value={id} /><Button type="submit" variant="outline">Send reminders now</Button></form>}
      </section>

      <p className="text-center text-xs text-muted-foreground">Email delivery history will appear here when notification logging is added.</p>
    </div>
  );
}

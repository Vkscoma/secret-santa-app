import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeft, Ban, CalendarDays, Gift, RefreshCw } from "lucide-react";
import { z } from "zod";
import { PairingCheckForm } from "@/app/admin/exchanges/[id]/pairing-check-form";
import { InviteCreateForm } from "@/app/admin/invite-create-form";
import { ExchangeStepTracker } from "@/components/admin/exchange-step-tracker";
import { PageContainer } from "@/components/secret-santa/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addAllowlistEntry,
  closeExchange,
  deleteExchange,
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
import { isSuperAdminEmail } from "@/lib/auth-access";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { utcToLocalInput } from "@/lib/exchange-time";
import { formatFirstName } from "@/lib/person-name";
import {
  assignments,
  auditLog,
  emailLog,
  exchangeParticipants,
  exchanges,
  exclusions,
  inviteLinks,
  inviteRedemptions,
  user,
  wishlistItems,
  wishlists,
} from "@/lib/schema";

type PageProps = { params: Promise<{ id: string }> };

function formatGiftDay(date: Date, timeZone: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date);
  const value = Object.fromEntries(formatted.map(({ type, value: part }) => [type, part]));
  return `${value.weekday}, ${value.month} ${value.day}, ${value.year} at ${value.hour}:${value.minute} ${value.dayPeriod} ${value.timeZoneName}`;
}

function personName(displayName: string | null, fullName: string | null) {
  return formatFirstName(displayName, fullName) ?? "Participant";
}

function budgetLabel(min: number | null, max: number | null) {
  if (min === null && max === null) return "Not set";
  return `$${min ?? 0}–$${max ?? "∞"}`;
}

function formatPrivateViewTime(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.month} ${parts.day} at ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${parts.timeZoneName}`;
}

export default async function AdminExchangePage({ params }: PageProps) {
  const session = await requireAdmin();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, id)).limit(1);
  if (!exchange) notFound();
  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  const privateViewActor = alias(user, "private_pairing_view_actor");

  const [eligibleUsers, participantRows, exclusionRows, inviteRows, wishlistCounts, latestReminder, privateViewRows] = await Promise.all([
    getUsersEligibleForExchange(id),
    db.select({
      userId: user.id,
      name: user.name,
      displayName: user.displayName,
      email: user.email,
      notificationPrefs: user.notificationPrefs,
    }).from(exchangeParticipants)
      .innerJoin(user, eq(exchangeParticipants.userId, user.id))
      .where(eq(exchangeParticipants.exchangeId, id))
      .orderBy(user.name),
    db.select({ giverId: exclusions.giverId, receiverId: exclusions.receiverId }).from(exclusions).where(eq(exclusions.exchangeId, id)),
    db.select({
      id: inviteLinks.id,
      label: inviteLinks.label,
      createdAt: inviteLinks.createdAt,
      expiresAt: inviteLinks.expiresAt,
      maxUses: inviteLinks.maxUses,
      revokedAt: inviteLinks.revokedAt,
    }).from(inviteLinks).where(eq(inviteLinks.exchangeId, id)).orderBy(desc(inviteLinks.createdAt)),
    db.select({ userId: wishlists.userId, gifts: count(wishlistItems.id) })
      .from(wishlists)
      .leftJoin(wishlistItems, eq(wishlistItems.wishlistId, wishlists.id))
      .where(eq(wishlists.exchangeId, id))
      .groupBy(wishlists.userId),
    db.select({ sentAt: emailLog.sentAt })
      .from(emailLog)
      .where(and(eq(emailLog.exchangeId, id), eq(emailLog.type, "reminder"), eq(emailLog.status, "sent")))
      .orderBy(desc(emailLog.sentAt))
      .limit(1),
    isSuperAdmin && exchange.status === "drawn"
      ? db.select({ createdAt: auditLog.createdAt, actorName: privateViewActor.name, actorDisplayName: privateViewActor.displayName })
        .from(auditLog)
        .leftJoin(privateViewActor, eq(auditLog.actorId, privateViewActor.id))
        .where(and(eq(auditLog.targetType, "exchange"), eq(auditLog.targetId, id), eq(auditLog.action, "exchange.pairings_viewed_privately")))
        .orderBy(desc(auditLog.createdAt))
        .limit(10)
      : Promise.resolve([]),
  ]);

  const participantIds = new Set(participantRows.map(({ userId }) => userId));
  const excludedPairs = new Set(exclusionRows.map(({ giverId, receiverId }) => `${giverId}\0${receiverId}`));
  const giftsByUser = new Map(wishlistCounts.map(({ userId, gifts }) => [userId, Number(gifts)]));
  const inviteUsage = inviteRows.length
    ? await db.select({ inviteLinkId: inviteRedemptions.inviteLinkId, uses: count() })
      .from(inviteRedemptions)
      .where(inArray(inviteRedemptions.inviteLinkId, inviteRows.map(({ id: inviteId }) => inviteId)))
      .groupBy(inviteRedemptions.inviteLinkId)
    : [];
  const usesByInvite = new Map(inviteUsage.map(({ inviteLinkId, uses }) => [inviteLinkId, Number(uses)]));

  // Assignment details are deliberately not queried until the exchange is revealed.
  const giverUser = alias(user, "giver_user");
  const receiverUser = alias(user, "receiver_user");
  const hasRevealedAssignments = exchange.status === "revealed" || exchange.status === "closed";
  const revealedAssignments = hasRevealedAssignments
    ? await db.select({
        giverId: assignments.giverId,
        giverName: giverUser.name,
        giverDisplayName: giverUser.displayName,
        receiverName: receiverUser.name,
        receiverDisplayName: receiverUser.displayName,
      })
      .from(assignments)
      .innerJoin(giverUser, eq(assignments.giverId, giverUser.id))
      .innerJoin(receiverUser, eq(assignments.receiverId, receiverUser.id))
      .where(eq(assignments.exchangeId, id))
    : [];

  const isOpen = exchange.status === "open";
  const canRedraw = exchange.status === "drawn" || exchange.status === "revealed";
  const giftDayPassed = exchange.exchangeAt <= new Date();
  const allWishlistsReady = participantRows.length >= 2 && participantRows.every(({ userId }) => (giftsByUser.get(userId) ?? 0) > 0);
  const optedInReminderRecipients = participantRows.filter(({ notificationPrefs }) => notificationPrefs?.reminders !== false);
  const currentLocalDate = utcToLocalInput(exchange.exchangeAt, exchange.timeZone);
  const giftDayText = formatGiftDay(exchange.exchangeAt, exchange.timeZone);
  const revealTimingText = exchange.autoReveal
    ? giftDayPassed
      ? `Automatic reveal was set for ${giftDayText}. Participants may already see their Secret Santa.`
      : `Secret Santas will be revealed on ${giftDayText}.`
    : giftDayPassed
      ? "Gift day has passed. You can reveal the Secret Santas now."
      : "You can reveal them on or after gift day.";
  const currentStep = hasRevealedAssignments || (exchange.status === "drawn" && giftDayPassed)
    ? 4
    : canRedraw ? 3
      : participantRows.some(({ userId }) => (giftsByUser.get(userId) ?? 0) > 0) ? 2
        : participantRows.length > 0 || inviteRows.length > 0 ? 1 : 0;
  const currentAdminIsParticipant = participantIds.has(session.user.id);

  return (
    <PageContainer className="space-y-6 py-6 sm:py-10">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to administration
      </Link>

      <header className="panel-pattern relative overflow-hidden rounded-2xl bg-pine p-5 text-pine-foreground shadow-md sm:p-8">
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-pine-foreground/80"><CalendarDays className="size-4" aria-hidden="true" /> Exchange administration</div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{exchange.name}</h1>
          <p className="text-sm text-pine-foreground/85"><strong>Gift day:</strong> {giftDayText}</p>
          <Badge variant="secondary" className="w-fit rounded-md bg-pine-foreground/10 px-2 py-0.5 text-[11px] font-medium capitalize text-pine-foreground">{exchange.status === "drawn" ? "Names drawn" : exchange.status}</Badge>
        </div>
      </header>

      <ExchangeStepTracker currentStep={currentStep as 0 | 1 | 2 | 3 | 4} />

      <Card className="space-y-3 border-gold/50 bg-gold/10 p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Next step</p>
          {isOpen ? allWishlistsReady ? <>
            <h2 className="mt-1 text-xl font-bold">Everyone has added a gift idea</h2>
            <p className="mt-1 text-sm text-muted-foreground">You’re ready to draw names.</p>
          </> : participantRows.length < 2 ? <>
            <h2 className="mt-1 text-xl font-bold">Invite people to join</h2>
            <p className="mt-1 text-sm text-muted-foreground">Once everyone has joined and added at least one gift idea, you can draw names.</p>
          </> : <>
            <h2 className="mt-1 text-xl font-bold">Wishlists are in progress</h2>
            <p className="mt-1 text-sm text-muted-foreground">Check who still needs to add a gift idea before you draw names.</p>
          </> : giftDayPassed && exchange.status === "drawn" ? <>
            <h2 className="mt-1 text-xl font-bold">Reveal Secret Santas</h2>
            <p className="mt-1 text-sm text-muted-foreground">Everyone will see who their Secret Santa was. This can’t be undone.</p>
          </> : exchange.status === "drawn" ? <>
            <h2 className="mt-1 text-xl font-bold">Send wishlist reminders</h2>
            <p className="mt-1 text-sm text-muted-foreground">Remind the people in this exchange to finish their gift ideas.</p>
          </> : <>
            <h2 className="mt-1 text-xl font-bold">Exchange complete</h2>
            <p className="mt-1 text-sm text-muted-foreground">The exchange has been revealed and is {exchange.status}.</p>
          </>}
        </div>
        {isOpen && (allWishlistsReady
          ? <Button asChild variant="affirmative"><a href="#draw-names">Go to Draw names</a></Button>
          : participantRows.length < 2
            ? <Button asChild variant="affirmative"><a href="#invite-people">Invite people</a></Button>
            : <Button asChild variant="neutral"><a href="#wishlist-readiness">Check wishlist progress</a></Button>)}
        {!isOpen && exchange.status === "drawn" && <Button asChild variant="affirmative"><a href={giftDayPassed ? "#reveal" : "#reminders"}>{giftDayPassed ? "Go to reveal" : "Send wishlist reminders"}</a></Button>}
        {!isOpen && exchange.status === "drawn" && <p className="text-sm text-muted-foreground">{revealTimingText}</p>}
      </Card>

      <Card className="space-y-4 p-5 sm:p-6" id="wishlist-readiness">
        <div><h2 className="text-xl font-bold">Wishlist readiness</h2><p className="text-sm text-muted-foreground">Each person needs at least one gift idea before you draw names.</p></div>
        {participantRows.length ? <ul className="grid gap-2 sm:grid-cols-2">
          {participantRows.map((person) => {
            const gifts = giftsByUser.get(person.userId) ?? 0;
            return <li key={person.userId} className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="min-w-0 truncate font-medium">{personName(person.displayName, person.name)}</span>
              <span className="shrink-0 text-muted-foreground">{gifts} {gifts === 1 ? "gift" : "gifts"}</span>
            </li>;
          })}
        </ul> : <p className="text-sm text-muted-foreground">No one has joined yet.</p>}
      </Card>

      {!isOpen ? <>
        {exchange.status !== "closed" && <Card className="space-y-4 p-5 sm:p-6" id="reminders">
          <div><h2 className="text-xl font-bold">Wishlist reminders</h2>
            <p className="text-sm text-muted-foreground">A reminder goes to people who have not turned reminders off.</p>
            <p className="mt-1 text-sm">{optedInReminderRecipients.length ? optedInReminderRecipients.map((person) => personName(person.displayName, person.name)).join(", ") : "No one is set to receive reminders."}</p>
            <p className="mt-1 text-xs text-muted-foreground">Last sent: {latestReminder[0]?.sentAt ? formatGiftDay(latestReminder[0].sentAt, exchange.timeZone) : "Not sent yet"}</p>
          </div>
          <form action={requestExchangeReminders}><input type="hidden" name="exchangeId" value={id} /><Button type="submit" variant="affirmative" disabled={optedInReminderRecipients.length === 0}>Send wishlist reminders</Button></form>
        </Card>}

        <Card className="space-y-4 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">Exchange setup</h2><p className="text-sm text-muted-foreground">The people, gift day, budget, notes, and rules for this exchange.</p></div>
          <p className="rounded-lg bg-muted p-3 text-sm font-medium text-muted-foreground">Locked after the draw.</p>
          <div><h3 className="font-semibold">People</h3><ul className="mt-2 space-y-1 text-sm">{participantRows.map((person) => <li key={person.userId}>{personName(person.displayName, person.name)}</li>)}</ul></div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Gift day</dt><dd className="font-medium">{giftDayText}</dd></div>
            <div><dt className="text-muted-foreground">Gift budget</dt><dd className="font-medium">{budgetLabel(exchange.budgetMin, exchange.budgetMax)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap font-medium">{exchange.notes || "No notes"}</dd></div>
          </dl>
          <div><h3 className="font-semibold">Exclusion rules</h3>{exclusionRows.length
            ? <ul className="mt-2 space-y-1 text-sm">{exclusionRows.map(({ giverId, receiverId }) => {
              const giver = participantRows.find(({ userId }) => userId === giverId);
              const receiver = participantRows.find(({ userId }) => userId === receiverId);
              return <li key={`${giverId}-${receiverId}`}>{giver ? personName(giver.displayName, giver.name) : "Participant"} will not draw {receiver ? personName(receiver.displayName, receiver.name) : "another participant"}.</li>;
            })}</ul>
            : <p className="mt-1 text-sm text-muted-foreground">No special rules. Nobody can draw themselves.</p>}</div>
        </Card>

        {inviteRows.length > 0 && <Card className="space-y-4 p-5 sm:p-6">
          <div><h2 className="text-lg font-bold">Invitation links</h2><p className="text-sm text-muted-foreground">These links can’t add anyone to this exchange now. If used, they give access to future exchanges and the organizer is notified.</p></div>
          <div className="space-y-2">{inviteRows.map((invite) => {
            const uses = usesByInvite.get(invite.id) ?? 0;
            const expired = Boolean(invite.expiresAt && invite.expiresAt <= new Date());
            const exhausted = invite.maxUses !== null && uses >= invite.maxUses;
            return <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 wrap-break-word"><p className="text-sm font-semibold">{invite.label || "Invite link"}</p><p className="text-sm text-muted-foreground">{invite.maxUses === null ? `${uses} ${uses === 1 ? "use" : "uses"} · unlimited` : `Used ${uses} of ${invite.maxUses} times`}</p><p className="text-xs text-muted-foreground">{invite.revokedAt ? "Revoked" : expired ? "Expired" : exhausted ? "Use limit reached" : "Active for future exchanges"}{invite.expiresAt ? ` · expires ${formatGiftDay(invite.expiresAt, exchange.timeZone)}` : " · no expiry"}</p></div>
              {!invite.revokedAt && !expired && !exhausted && <form action={revokeExchangeInvite}><input type="hidden" name="inviteId" value={invite.id} /><Button size="sm" variant="destructive"><Ban className="size-4" aria-hidden="true" />Revoke</Button></form>}
            </div>;
          })}</div>
        </Card>}

        {exchange.status === "drawn" && <Card className="space-y-4 p-5 sm:p-6" id="reveal">
          <div><h2 className="text-xl font-bold">Reveal Secret Santas</h2><p className="text-sm text-muted-foreground">Everyone will see who their Secret Santa was. This can’t be undone.</p>
            <p className="text-sm text-muted-foreground">{revealTimingText}</p></div>
          <form action={revealExchange} className="space-y-3">
            <input type="hidden" name="exchangeId" value={id} />
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmReveal" required className="mt-1 size-4 accent-primary" /><span>I’m ready for everyone to see who their Secret Santa was.</span></label>
            <Button type="submit" variant="affirmative">Reveal Secret Santas</Button>
          </form>
        </Card>}
        {exchange.status === "revealed" && <Card className="space-y-3 p-5 sm:p-6"><h2 className="text-xl font-bold">Secret Santas revealed</h2><p className="text-sm text-muted-foreground">Everyone can now see who their Secret Santa was.</p>
          <div className="divide-y divide-border">{revealedAssignments.map((pair) => <div key={pair.giverId} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="min-w-0 truncate font-semibold">{personName(pair.giverDisplayName, pair.giverName)}</span><span className="text-muted-foreground">shops for</span><span className="min-w-0 truncate text-right">{personName(pair.receiverDisplayName, pair.receiverName)}</span></div>)}</div>
          <form action={closeExchange}><input type="hidden" name="exchangeId" value={id} /><Button type="submit" variant="neutral">Close exchange</Button></form>
        </Card>}
        {exchange.status === "closed" && <Card className="p-5"><p className="text-sm text-muted-foreground">This exchange is closed. Its revealed pairings remain available in the exchange setup.</p></Card>}
      </> : <>
        <Card className="space-y-5 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">Participants</h2><p className="text-sm text-muted-foreground">Choose who can take part in this year’s draw.</p></div>
          <form action={setExchangeParticipants} className="space-y-4">
            <input type="hidden" name="exchangeId" value={id} />
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
              {eligibleUsers.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                <input type="checkbox" name="participantId" value={person.id} defaultChecked={participantIds.has(person.id)} className="size-4 accent-primary" />
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{personName(person.displayName, person.name)}</strong><span className="block truncate text-xs text-muted-foreground">{person.email}</span></span>
                {person.role === "admin" && <Badge variant="outline">Admin</Badge>}
              </label>)}
              {!eligibleUsers.length && <p className="p-2 text-sm text-muted-foreground">No one is ready to join yet. Add a person or share an invite link below.</p>}
            </div>
            <p className="text-xs text-muted-foreground">You need at least two people to draw names.</p>
            <Button type="submit" variant="affirmative">Save people</Button>
          </form>
        </Card>

        <Card className="space-y-5 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">Exclusion rules</h2><p className="text-sm text-muted-foreground">Choose pairings to avoid. Nobody can draw themselves.</p></div>
          <form action={setExchangeExclusions} className="space-y-4">
            <input type="hidden" name="exchangeId" value={id} />
            {participantRows.length < 2 ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Choose at least two people to set rules.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {eligibleUsers.filter((person) => participantIds.has(person.id)).map((giver) => <fieldset key={giver.id} className="rounded-xl border border-border p-3">
                <legend className="px-1 text-sm font-semibold">{personName(giver.displayName, giver.name)} will not draw</legend>
                <div className="mt-2 space-y-1.5">
                  {eligibleUsers.filter((receiver) => participantIds.has(receiver.id) && receiver.id !== giver.id).map((receiver) => {
                    const key = `${giver.id}\0${receiver.id}`;
                    return <label key={receiver.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="exclusion" value={JSON.stringify([giver.id, receiver.id])} defaultChecked={excludedPairs.has(key)} className="size-4 accent-primary" /><span>{personName(receiver.displayName, receiver.name)}</span></label>;
                  })}
                </div>
              </fieldset>)}
            </div>}
            <Button type="submit" variant="affirmative">Save rules</Button>
          </form>
        </Card>

        <Card className="space-y-5 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">Exchange settings</h2><p className="text-sm text-muted-foreground">Set the gift day, budget, and any helpful notes.</p></div>
          <form action={updateExchange} className="grid gap-3">
            <input type="hidden" name="exchangeId" value={id} />
            <label className="grid gap-1 text-sm font-medium">Exchange name<Input name="name" required minLength={2} maxLength={100} defaultValue={exchange.name} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-medium">Year<Input name="year" type="number" min="2020" max="2200" defaultValue={exchange.year} /></label>
              <label className="grid gap-1 text-sm font-medium">Time zone<Input name="timeZone" required defaultValue={exchange.timeZone} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-medium">Budget minimum ($)<Input name="budgetMin" type="number" min="0" defaultValue={exchange.budgetMin ?? ""} /></label>
              <label className="grid gap-1 text-sm font-medium">Budget maximum ($)<Input name="budgetMax" type="number" min="0" defaultValue={exchange.budgetMax ?? ""} /></label>
            </div>
            <label className="grid gap-1 text-sm font-medium">Gift day<Input name="exchangeAt" type="datetime-local" required defaultValue={currentLocalDate} /></label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="autoReveal" defaultChecked={exchange.autoReveal} className="mt-1 size-4 accent-primary" /><span><strong>Reveal Secret Santas automatically</strong><span className="block text-muted-foreground">People will be able to see their Secret Santa at gift day.</span></span></label>
            <label className="grid gap-1 text-sm font-medium">Notes<Textarea name="notes" rows={3} defaultValue={exchange.notes ?? ""} maxLength={2000} /></label>
            <Button type="submit" variant="affirmative">Save settings</Button>
          </form>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <div><h2 className="text-lg font-bold">Add a person</h2><p className="text-sm text-muted-foreground">Add someone by email for this exchange only.</p></div>
          <form action={addAllowlistEntry} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="exchangeId" value={id} />
            <label className="sr-only" htmlFor="exchange-allowlist-email">Email address</label>
            <Input id="exchange-allowlist-email" name="email" type="email" required placeholder="friend@example.com" className="min-w-0 flex-1" />
            <Button type="submit" variant="affirmative">Add person</Button>
          </form>
        </Card>

        <div id="invite-people"><InviteCreateForm exchangeId={id} /></div>
        <Card className="space-y-4 p-5 sm:p-6">
          <div><h2 className="text-lg font-bold">Invitation links</h2><p className="text-sm text-muted-foreground">For privacy, an invite link is shown only once, when you create it. Used and expired links remain listed here.</p></div>
          {inviteRows.length ? <div className="space-y-2">{inviteRows.map((invite) => {
            const uses = usesByInvite.get(invite.id) ?? 0;
            const expired = Boolean(invite.expiresAt && invite.expiresAt <= new Date());
            const exhausted = invite.maxUses !== null && uses >= invite.maxUses;
            return <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 wrap-break-word"><p className="text-sm font-semibold">{invite.label || "Invite link"}</p><p className="text-sm text-muted-foreground">{invite.maxUses === null ? `${uses} ${uses === 1 ? "use" : "uses"} · unlimited` : `Used ${uses} of ${invite.maxUses} times`}</p><p className="text-xs text-muted-foreground">{invite.revokedAt ? "Revoked" : expired ? "Expired" : exhausted ? "Use limit reached" : "Active"}{invite.expiresAt ? ` · expires ${formatGiftDay(invite.expiresAt, exchange.timeZone)}` : " · no expiry"}</p></div>
              {!invite.revokedAt && !expired && !exhausted && <form action={revokeExchangeInvite}><input type="hidden" name="inviteId" value={invite.id} /><Button size="sm" variant="destructive"><Ban className="size-4" aria-hidden="true" />Revoke</Button></form>}
            </div>;
          })}</div> : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No invite links yet.</p>}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6" id="draw-names">
          <div><h2 className="text-xl font-bold">Draw names</h2><p className="text-sm text-muted-foreground">When everyone has joined and added at least one gift idea, make the Secret Santa pairings.</p></div>
          <form action={drawExchange}><input type="hidden" name="exchangeId" value={id} /><Button type="submit" variant="affirmative" disabled={!allWishlistsReady}><Gift className="size-4" aria-hidden="true" />{allWishlistsReady ? "Draw names" : "Waiting for everyone to add a gift idea"}</Button></form>
        </Card>
      </>}

      {(canRedraw || isSuperAdmin) && <details id="danger-zone" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <summary className="min-h-11 cursor-pointer text-lg font-bold">Danger zone</summary>
        <div className="mt-4 space-y-5">
          {isSuperAdmin && exchange.status === "drawn" && <>
            <section className="space-y-3 border-b border-border pb-5">
              <div><h2 className="font-bold">Check pairings</h2><p className="mt-1 text-sm text-muted-foreground">Check that the draw follows every rule. This check shows counts and results only; it won’t show anyone’s name.</p></div>
              <PairingCheckForm exchangeId={id} />
            </section>
            <section className="space-y-3 border-b border-border pb-5">
              <div><h2 className="font-bold">View pairings privately</h2><p className="mt-1 text-sm text-muted-foreground">Open a temporary list visible only to you. It won’t send anyone a notice or change the exchange’s reveal status.</p></div>
              <form method="post" action={`/api/admin/exchanges/${id}/private-pairings`} className="space-y-3">
                <input type="hidden" name="exchangeId" value={id} />
                <input type="hidden" name="mode" value="show" />
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmPrivateView" value="on" required className="mt-1 size-4 accent-primary" /><span>{currentAdminIsParticipant
                  ? "I’m also a participant. This will show who drew me and spoil my own surprise."
                  : "I understand this will open every pairing in this exchange, including to me. This view will stay private."}</span></label>
                <Button type="submit" variant="destructive" size="sm">View pairings privately</Button>
              </form>
              <p className="text-xs text-muted-foreground">The activity log records that you viewed the pairings, but doesn’t include the pairings themselves.</p>
              {privateViewRows.length > 0 && <div className="space-y-1 text-xs text-muted-foreground" aria-label="Private pairing view activity">
                <p className="font-semibold text-foreground">Private view activity</p>
                {privateViewRows.map((view, index) => <p key={`${view.createdAt.toISOString()}-${index}`}>{personName(view.actorDisplayName, view.actorName)} viewed pairings privately · {formatPrivateViewTime(view.createdAt, exchange.timeZone)}</p>)}
              </div>}
            </section>
          </>}
          {canRedraw && <div className="rounded-xl border border-destructive/50 p-4">
            <h2 className="font-bold text-destructive">Redraw names</h2>
            <p className="mt-1 text-sm text-muted-foreground">Everyone gets a new person to shop for, and gifts they’ve marked will be cleared.</p>
            <form action={redrawExchange} className="mt-3 grid gap-3">
              <input type="hidden" name="exchangeId" value={id} />
              <label className="grid gap-1 text-sm">Type <strong>{exchange.name}</strong> to confirm<Input name="confirmExchangeName" required autoComplete="off" /></label>
              <Button type="submit" variant="destructive"><RefreshCw className="size-4" aria-hidden="true" />Redraw names</Button>
            </form>
          </div>}
          {isSuperAdmin && <div className="rounded-xl border border-destructive/50 p-4">
            <h2 className="font-bold text-destructive">Delete exchange</h2>
            <p className="mt-1 text-sm text-muted-foreground">This permanently deletes the exchange, its wishlists, and its pairings.</p>
            <form action={deleteExchange} className="mt-3 grid gap-3">
              <input type="hidden" name="exchangeId" value={id} />
              <label className="grid gap-1 text-sm">Type <strong>{exchange.name}</strong> to confirm<Input name="confirmExchangeName" required autoComplete="off" /></label>
              <Button type="submit" variant="destructive"><Ban className="size-4" aria-hidden="true" />Delete exchange</Button>
            </form>
          </div>}
        </div>
      </details>}

      {exchange.status === "revealed" && <p className="text-center text-xs text-muted-foreground">Email history is available on the administration page.</p>}
    </PageContainer>
  );
}

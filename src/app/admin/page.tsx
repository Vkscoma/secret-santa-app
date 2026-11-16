import { desc, sql } from "drizzle-orm";
import { CalendarDays, Gift, ShieldCheck, Trash2, Users } from "lucide-react";
import { ExchangeRowActions } from "@/app/admin/exchange-row-actions";
import { RemoveAccountButton } from "@/app/admin/remove-account-button";
import { ExchangeStepTracker, type ExchangeStep } from "@/components/admin/exchange-step-tracker";
import { PageContainer } from "@/components/secret-santa/page-container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { addAllowlistEntry, createExchange, removeAllowlistEntry, saveUserSettings, setUserRole } from "@/lib/actions/admin";
import { isSuperAdminEmail } from "@/lib/auth-access";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { allowlist, emailLog, exchanges, user } from "@/lib/schema";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function inputText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((entry) => inputText(entry)).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}: ${inputText(entry)}`)
      .filter((entry) => !entry.endsWith(": "))
      .join(", ");
  }
  return "";
}

export default async function AdminPage() {
  const session = await requireAdmin();
  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  const [exchangeRows, allowlistRows, users, exchangeColumns, emailRows] = await Promise.all([
    db.select({
      id: exchanges.id,
      name: exchanges.name,
      year: exchanges.year,
      status: exchanges.status,
      exchangeAt: exchanges.exchangeAt,
      autoReveal: exchanges.autoReveal,
      createdAt: exchanges.createdAt,
      participantCount: sql<number>`(select count(*)::int from "exchange_participant" ep where ep."exchange_id" = "exchange"."id")`,
      inviteCount: sql<number>`(select count(*)::int from "invite_links" il where il."exchange_id" = "exchange"."id" and il."revoked_at" is null)`,
      wishlistItemCount: sql<number>`(select count(*)::int from "wishlist_item" wi inner join "wishlist" wl on wl."id" = wi."wishlist_id" where wl."exchange_id" = "exchange"."id")`,
    })
      .from(exchanges)
      .orderBy(desc(exchanges.year), desc(exchanges.createdAt)),
    db.select({ id: allowlist.id, email: allowlist.email, exchangeId: allowlist.exchangeId, createdAt: allowlist.createdAt })
      .from(allowlist)
      .orderBy(allowlist.createdAt),
    db.select({ id: user.id, name: user.name, email: user.email, role: user.role, displayName: user.displayName, shippingAddress: user.shippingAddress, sizes: user.sizes, notes: user.notes, notificationPrefs: user.notificationPrefs }).from(user).orderBy(user.name),
    db.execute(sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'exchange'`),
    db.select({ id: emailLog.id, recipientEmail: user.email, type: emailLog.type, status: emailLog.status, createdAt: emailLog.createdAt, sentAt: emailLog.sentAt })
      .from(emailLog).innerJoin(user, sql`${emailLog.recipientUserId} = ${user.id}`).orderBy(desc(emailLog.createdAt)).limit(30),
  ]);
  const presentExchangeColumns = new Set(exchangeColumns.map((row) => String(row.column_name)));
  const requiredExchangeColumns = ["budget_min", "budget_max", "exchange_at", "time_zone", "notes", "auto_reveal"];
  const missingExchangeColumns = requiredExchangeColumns.filter((column) => !presentExchangeColumns.has(column));
  const exchangeSchemaReady = missingExchangeColumns.length === 0;

  return (
    <PageContainer className="space-y-8">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground"><ShieldCheck className="size-4" /> Administration</div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Keep the holiday plans in order</h1>
        <p className="max-w-2xl text-muted-foreground">Manage who can join, prepare an exchange, and run a private, fair draw.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Admin overview">
        <Card className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground"><CalendarDays className="size-5" /></span><span><strong className="block text-xl">{exchangeRows.length}</strong><span className="text-sm text-muted-foreground">Exchanges</span></span></Card>
        <Card className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Users className="size-5" /></span><span><strong className="block text-xl">{users.length}</strong><span className="text-sm text-muted-foreground">Accounts</span></span></Card>
        <Card className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-gold/20 text-gold-foreground"><Gift className="size-5" /></span><span><strong className="block text-xl">{allowlistRows.length}</strong><span className="text-sm text-muted-foreground">People with join access</span></span></Card>
      </section>

      <Card className="space-y-2 border-gold/50 dark:border-gold/70 bg-gold/10 p-4 sm:p-5">
        <h2 className="font-bold">Database schema readiness</h2>
        {exchangeSchemaReady
          ? <p className="text-sm text-muted-foreground">The exchange schema has the columns needed to create and manage exchanges.</p>
          : <p role="status" className="text-sm text-muted-foreground">The connected database is missing exchange fields required by this app ({missingExchangeColumns.join(", ")}). Existing data is still available below, but exchange creation is disabled until the schema is reconciled and migrated.</p>}
      </Card>

      <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
        <Card className="min-w-0 space-y-4 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">Exchanges</h2><p className="text-sm text-muted-foreground">Secret Santa pairings stay private until you reveal them.</p></div>
          {exchangeRows.length ? <div className="divide-y divide-border">
            {exchangeRows.map((exchange) => {
              const giftDayPassed = exchange.exchangeAt <= new Date();
              const currentStep: ExchangeStep = exchange.status === "open"
                ? Number(exchange.wishlistItemCount) > 0
                  ? 2
                  : Number(exchange.participantCount) > 0 || Number(exchange.inviteCount) > 0
                    ? 1
                    : 0
                : exchange.status === "drawn" && !giftDayPassed
                  ? 3
                  : 4;
              return <div key={exchange.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span><span className="block font-bold">{exchange.name}</span><span className="text-sm text-muted-foreground">{exchange.year} · created {formatDate(exchange.createdAt)}</span></span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">{exchange.status}</span>
                    <ExchangeRowActions exchangeId={exchange.id} />
                  </div>
                </div>
                <ExchangeStepTracker currentStep={currentStep} />
              </div>;
            })}
          </div> : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No exchanges yet. Create one to invite your group and prepare a draw.</p>}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">Create an exchange</h2><p className="text-sm text-muted-foreground">Choose the date and time zone your group will use.</p></div>
          <form action={createExchange} className="grid gap-3">
            <fieldset disabled={!exchangeSchemaReady} className="grid gap-3 disabled:opacity-55">
            <label className="grid gap-1 text-sm font-medium">Exchange name<input name="name" required minLength={2} maxLength={100} placeholder="Family Secret Santa" className="h-10 rounded-lg border border-input bg-background px-3" /></label>
            <label className="grid gap-1 text-sm font-medium">Year<input name="year" required type="number" min="2020" max="2200" defaultValue={new Date().getFullYear()} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-medium">Budget min ($)<input name="budgetMin" type="number" min="0" max="100000" className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm font-medium">Budget max ($)<input name="budgetMax" type="number" min="0" max="100000" className="h-10 rounded-lg border border-input bg-background px-3" /></label>
            </div>
            <label className="grid gap-1 text-sm font-medium">Date and time<input name="exchangeAt" type="datetime-local" required className="h-10 rounded-lg border border-input bg-background px-3" /></label>
            <label className="grid gap-1 text-sm font-medium">Time zone<input name="timeZone" required defaultValue="America/Los_Angeles" className="h-10 rounded-lg border border-input bg-background px-3" /></label>
            <label className="grid gap-1 text-sm font-medium">Notes<textarea name="notes" maxLength={2000} rows={3} className="rounded-lg border border-input bg-background px-3 py-2" /></label>
            <label className="flex items-start gap-2 text-sm"><input name="autoReveal" type="checkbox" className="mt-1 accent-primary" /><span><strong>Reveal automatically</strong><span className="block text-muted-foreground">Store this preference for a later scheduled reveal.</span></span></label>
            <Button type="submit" variant="affirmative">Create exchange</Button>
            </fieldset>
            {!exchangeSchemaReady && <p className="text-xs text-muted-foreground">Creation will become available after the missing columns are applied through a reviewed migration.</p>}
          </form>
        </Card>
      </section>

      <Card className="space-y-4 p-5 sm:p-6">
        <div><h2 className="text-xl font-bold">Recent email activity</h2><p className="text-sm text-muted-foreground">Delivery history includes recipient and status only. Assignment pairings are never stored here.</p></div>
        <div className="max-h-80 divide-y divide-border overflow-auto">
          {emailRows.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0">
            <span className="min-w-0"><strong className="block truncate">{entry.recipientEmail}</strong><span className="text-xs text-muted-foreground">{entry.type.replaceAll("-", " ")}</span></span>
            <span className="flex shrink-0 items-center gap-2"><span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">{entry.status}</span><span className="text-xs text-muted-foreground">{formatDate(entry.sentAt ?? entry.createdAt)}</span></span>
          </div>)}
          {!emailRows.length && <p className="py-2 text-sm text-muted-foreground">No emails have been logged yet.</p>}
        </div>
      </Card>

      <section className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card className="min-w-0 space-y-4 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">People who can join any exchange</h2><p className="text-sm text-muted-foreground">These email addresses can join any open exchange. An invite link can also add someone to one exchange.</p></div>
          <form action={addAllowlistEntry} className="flex flex-col gap-2 sm:flex-row"><input name="email" type="email" required placeholder="friend@example.com" className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3" /><Button type="submit" variant="affirmative">Add email</Button></form>
          <div className="max-h-72 min-w-0 space-y-2 overflow-y-auto">
            {allowlistRows.map((entry) => <div key={entry.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="min-w-0"><span className="block break-all">{entry.email}</span><span className="block text-xs text-muted-foreground">{entry.exchangeId ? "exchange access" : "global access"} · added {formatDate(entry.createdAt)}</span></span>
              <form action={removeAllowlistEntry}><input type="hidden" name="allowlistId" value={entry.id} /><Button type="submit" size="sm" variant="destructive" aria-label={`Remove ${entry.email}`}><Trash2 className="size-4" aria-hidden="true" />Remove</Button></form>
            </div>)}
            {!allowlistRows.length && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No one has join access yet. Add an email to let someone join.</p>}
          </div>
        </Card>

        <Card className="min-w-0 space-y-4 p-5 sm:p-6">
          <div><h2 className="text-xl font-bold">People and settings</h2><p className="text-sm text-muted-foreground">Admins can update profiles and roles. The configured super-admin cannot be demoted.</p></div>
          <div className="max-h-[34rem] min-w-0 space-y-3 overflow-y-auto">
            {users.map((person) => {
              const prefs = person.notificationPrefs ?? {};
              return <details key={person.id} className="min-w-0 rounded-xl border border-border p-3">
                <summary className="grid min-w-0 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><span className="min-w-0"><strong className="block break-words">{person.displayName || person.name}</strong><span className="block break-all text-xs text-muted-foreground">{person.email}</span></span><span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{person.role}</span></summary>
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  {isSuperAdmin && !isSuperAdminEmail(person.email) && <RemoveAccountButton userId={person.id} email={person.email} />}
                  <form action={setUserRole} className="flex items-center gap-2"><input type="hidden" name="userId" value={person.id} /><label className="sr-only" htmlFor={`role-${person.id}`}>Role for {person.email}</label><select id={`role-${person.id}`} name="role" defaultValue={person.role} className="h-9 flex-1 rounded-lg border border-input bg-background px-2 text-sm"><option value="user">User</option><option value="admin">Admin</option></select><Button size="sm" variant="affirmative">Save role</Button></form>
                  <form action={saveUserSettings} className="grid gap-3">
                    <input type="hidden" name="userId" value={person.id} />
                    <label className="grid gap-1 text-sm">Display name<input name="displayName" defaultValue={person.displayName ?? ""} className="h-9 rounded-lg border border-input bg-background px-2" /></label>
                    <label className="grid gap-1 text-sm">Shipping address<textarea name="shippingAddress" defaultValue={person.shippingAddress ?? ""} rows={2} className="rounded-lg border border-input bg-background px-2 py-1.5" /></label>
                    <label className="grid gap-1 text-sm">Sizes<input name="sizes" defaultValue={inputText(person.sizes)} className="h-9 rounded-lg border border-input bg-background px-2" /></label>
                    <label className="grid gap-1 text-sm">Admin notes<textarea name="notes" defaultValue={person.notes ?? ""} rows={2} className="rounded-lg border border-input bg-background px-2 py-1.5" /></label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">{[["prefReminders", "Reminders", prefs.reminders], ["prefNudges", "Nudges", prefs.nudges], ["prefDigests", "Digests", prefs.digests]].map(([name, label, checked]) => <label key={String(name)} className="flex items-center gap-1.5"><input type="checkbox" name={String(name)} defaultChecked={checked !== false} className="accent-primary" />{String(label)}</label>)}</div>
                    <Button size="sm" variant="affirmative" className="justify-self-start">Save settings</Button>
                  </form>
                </div>
              </details>;
            })}
          </div>
        </Card>
      </section>

    </PageContainer>
  );
}

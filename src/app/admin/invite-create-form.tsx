"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createExchangeInvite, type CreateInviteState } from "@/lib/actions/admin";

const initialState: CreateInviteState = {};

export function InviteCreateForm({ exchangeId }: { exchangeId: string }) {
  const [state, action, pending] = useActionState(createExchangeInvite, initialState);
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Invite people</h2>
        <p className="text-sm text-muted-foreground">For privacy, you can only see an invite link once, when you create it. Copy it somewhere safe to share.</p>
      </div>
      <form action={action} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <input type="hidden" name="exchangeId" value={exchangeId} />
        <label className="grid gap-1 text-sm font-medium">Link label <span className="text-xs font-normal text-muted-foreground">Optional, such as “Family group chat”</span>
          <input name="label" maxLength={100} placeholder="Family group chat" className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Expires in days
          <input name="expiresInDays" type="number" min="1" max="365" defaultValue="14" required className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Maximum uses <span className="text-xs font-normal text-muted-foreground">Leave blank for unlimited</span>
          <input name="maxUses" type="number" min="1" max="10000" className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3" />
        </label>
        <div className="sm:col-span-2"><Button type="submit" variant="affirmative" disabled={pending}>{pending ? "Creating…" : "Create invite"}</Button></div>
      </form>
      {state.message && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
      {state.inviteUrl && <div className="rounded-lg border border-gold/40 dark:border-gold/70 bg-gold/10 p-3">
        <p className="mb-2 break-all text-sm font-semibold">{state.inviteUrl}</p>
        <Button type="button" variant="neutral" size="sm" className="px-0" onClick={() => navigator.clipboard.writeText(state.inviteUrl!)}>Copy invite link</Button>
      </div>}
    </Card>
  );
}

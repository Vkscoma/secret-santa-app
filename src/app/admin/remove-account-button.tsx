"use client";

import { Button } from "@/components/ui/button";
import { deleteUserAccount } from "@/lib/actions/admin";

export function RemoveAccountButton({ userId, email }: { userId: string; email: string }) {
  return (
    <form action={deleteUserAccount}>
      <input type="hidden" name="userId" value={userId} />
      <Button
        type="submit"
        size="sm"
        variant="destructive"
        onClick={(event) => {
          if (!window.confirm(`Permanently remove the account ${email}? This also removes its sessions, sign-in accounts, invite redemptions, pending magic links, allowlist entries, and email logs. Existing exchange history must be removed first; user accounts are not removed with exchanges.`)) {
            event.preventDefault();
          }
        }}
      >Remove account</Button>
    </form>
  );
}

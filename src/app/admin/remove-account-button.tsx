"use client";

import { Trash2 } from "lucide-react";
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
          if (!window.confirm(`Permanently remove the account ${email}? This also removes its sign-in sessions, invitation history, pending sign-in links, join permissions, and email history. Remove this person's exchange history first; removing an exchange does not remove the account.`)) {
            event.preventDefault();
          }
        }}
      ><Trash2 className="size-4" aria-hidden="true" />Remove account</Button>
    </form>
  );
}

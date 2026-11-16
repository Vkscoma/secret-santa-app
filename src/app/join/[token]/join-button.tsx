"use client";

import { useState } from "react";
import { requestMagicLink, setPendingInvite } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

export function JoinButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return <div className="space-y-3">
    <Button variant="affirmative" className="w-full" disabled={busy} onClick={async () => {
      setBusy(true);
      const state = await setPendingInvite(token);
      if (!state) { setError("This invite isn’t available anymore. Ask your organizer for a fresh link."); setBusy(false); return; }
      await signIn.social({ provider: "google", callbackURL: `/join/complete?state=${encodeURIComponent(state)}`, errorCallbackURL: "/not-allowed" });
    }}>{busy ? "Opening Google…" : "Join with Google"}</Button>
    <div className="relative text-center text-xs text-muted-foreground"><span className="bg-card px-2">or continue with email</span></div>
    <form onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      setBusy(true);
      setError("");
      setMessage("");
      try {
        const state = await setPendingInvite(token);
        if (!state) {
          setError("This invite isn’t available anymore. Ask your organizer for a fresh link.");
          return;
        }
        const response = await requestMagicLink(formData);
        setMessage(response.message);
      } catch {
        setMessage("If you can sign in with this email, we’ll send a sign-in link shortly.");
      } finally {
        setBusy(false);
      }
    }} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="invite-email">Email address</Label>
        <Input id="invite-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required disabled={busy} />
      </div>
      <Button type="submit" variant="neutral" className="w-full" disabled={busy}>{busy ? "Sending…" : "Email me a secure link"}</Button>
      {message && <div className="space-y-2 text-center text-sm text-muted-foreground">
        <p role="status">{message}</p>
        <p>Check your inbox and spam folder for a sign-in email. If asked for your email again, use the same address you entered above. Open the link to finish; you’ll then see a confirmation explaining whether you joined this year’s exchange or are set up for future exchanges. Tap Continue to see your wish lists.</p>
      </div>}
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}

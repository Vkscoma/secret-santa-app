"use client";

import { useState, useTransition } from "react";
import { requestMagicLink } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, useSession } from "@/lib/auth-client";

export function SignInButton({ returnTo = "/wishlists" }: { returnTo?: string }) {
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();
  if (isPending) return <Button disabled>Loading…</Button>;
  if (session) return null;

  return (
    <div className="w-full max-w-sm space-y-5">
      <Button className="w-full" onClick={() => signIn.social({ provider: "google", callbackURL: returnTo, errorCallbackURL: "/not-allowed" })}>
        Continue with Google
      </Button>
      <div className="relative text-center text-xs text-muted-foreground"><span className="bg-card px-2">or continue with email</span></div>
      <form action={(data) => startTransition(async () => {
        const response = await requestMagicLink(data);
        setMessage(response.message);
      })} className="space-y-3">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} />
        </div>
        <Button type="submit" variant="outline" className="w-full" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</Button>
        {message && <div className="space-y-2 text-center text-sm text-muted-foreground">
          <p role="status">{message}</p>
          <p>Check your inbox and spam folder for a sign-in email. Open the link to sign in and return to the page you started from, usually My Wishlists. If asked, use the same email address you entered above.</p>
        </div>}
        <p className="text-center text-xs text-muted-foreground">The link works once and expires after 15 minutes.</p>
      </form>
    </div>
  );
}

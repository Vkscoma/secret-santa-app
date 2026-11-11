"use client";

import { useState, useTransition } from "react";
import { requestMagicLink } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, useSession } from "@/lib/auth-client";

export function SignInButton({ returnTo = "/dashboard" }: { returnTo?: string }) {
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
        <Button type="submit" variant="outline" className="w-full" disabled={busy}>{busy ? "Sending…" : "Email me a secure link"}</Button>
        {message && <p role="status" className="text-center text-sm text-muted-foreground">{message}</p>}
        <p className="text-center text-xs text-muted-foreground">Links are one-use and expire after 15 minutes.</p>
      </form>
    </div>
  );
}

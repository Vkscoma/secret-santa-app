import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findActiveInvite } from "@/lib/invites";
import { JoinButton } from "./join-button";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findActiveInvite(token);
  // Missing, revoked, expired, and used-up invites share one friendly message.
  if (!invite) {
    return <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center"><CardTitle>This invite isn’t available</CardTitle><CardDescription>It may have expired, reached its limit, or the names may already be drawn.</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-center text-sm text-muted-foreground"><p>Ask your Secret Santa organizer for a fresh invite link.</p><Link className="text-primary underline" href="/login">Return to sign in</Link></CardContent>
      </Card>
    </main>;
  }
  return <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
    <Card className="w-full max-w-md">
      <CardHeader className="text-center"><CardTitle>{invite.exchangeStatus === "open" ? "You’re invited!" : "You’re invited for future exchanges"}</CardTitle><CardDescription>{invite.exchangeStatus === "open" ? <>Join {invite.exchangeNameSnapshot} for this year’s Secret Santa.</> : <>The names for {invite.exchangeNameSnapshot} have already been drawn. This link can still give your account access for future exchanges.</>}</CardDescription></CardHeader>
      <CardContent><JoinButton token={token} /></CardContent>
    </Card>
  </main>;
}

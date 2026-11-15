import Link from "next/link";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeReturnTo } from "@/lib/safe-return-to";

export default async function InviteResultPage({ searchParams }: { searchParams: Promise<{ outcome?: string; returnTo?: string }> }) {
  const { outcome, returnTo: requestedReturnTo } = await searchParams;
  const returnTo = safeReturnTo(requestedReturnTo);
  const joinedThisYear = outcome === "joined";
  const Icon = joinedThisYear ? CheckCircle2 : LockKeyhole;
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-pine"><Icon className="size-6" aria-hidden="true" /></span>
          <CardTitle>{joinedThisYear ? "You’re in this year’s exchange!" : "Your account is ready"}</CardTitle>
          <CardDescription>
            {joinedThisYear
              ? "You’ve joined this year’s exchange. Add a few gift ideas to your wish list to help your Secret Santa choose."
              : "This year’s names were already chosen, so you weren’t added to this exchange. Your account is ready for future exchanges, and the organizer has been notified."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild><Link href={returnTo}>See my wish lists</Link></Button>
        </CardContent>
      </Card>
    </main>
  );
}

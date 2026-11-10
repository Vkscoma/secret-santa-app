import Link from "next/link";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function InviteResultPage({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  const { outcome } = await searchParams;
  const joinedThisYear = outcome === "joined";
  const Icon = joinedThisYear ? CheckCircle2 : LockKeyhole;
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-pine"><Icon className="size-6" aria-hidden="true" /></span>
          <CardTitle>{joinedThisYear ? "You’re on the list!" : "Your account is ready"}</CardTitle>
          <CardDescription>
            {joinedThisYear
              ? "You’ve joined this year’s exchange. The organizer can now manage your participation."
              : "This year’s names have already been drawn, so we added your account for future Secret Santa exchanges without changing this year’s draw. The organizer has been notified."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild><Link href="/dashboard">Continue</Link></Button>
        </CardContent>
      </Card>
    </main>
  );
}

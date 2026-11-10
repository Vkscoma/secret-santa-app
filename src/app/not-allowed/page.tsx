import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotAllowedPage() {
  return <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
    <Card className="w-full max-w-md"><CardHeader><CardTitle>Invitation required</CardTitle><CardDescription>This email isn’t on the guest list yet.</CardDescription></CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground"><p>Ask your Secret Santa organizer to add your email or send you an invite link.</p><Link className="text-primary underline" href="/login">Return to sign in</Link></CardContent>
    </Card>
  </main>;
}

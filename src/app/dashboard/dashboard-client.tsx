"use client";

import { Lock } from "lucide-react";
import { UserProfile } from "@/components/auth/user-profile";
import { useSession } from "@/lib/auth-client";

export default function DashboardPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">Loading...</div>
    );
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-8">
            <Lock className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <h1 className="mb-2 text-2xl font-bold">Protected Page</h1>
            <p className="mb-6 text-muted-foreground">
              Sign in to see your Secret Santa exchange.
            </p>
          </div>
          <UserProfile />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-3xl font-bold">Your account</h1>
      <div className="max-w-xl rounded-lg border border-border p-6">
        <p className="mb-4 text-muted-foreground">
          Your Secret Santa exchange will appear here when it’s ready.
        </p>
        <div className="space-y-2">
          <p>
            <strong>Name:</strong> {session.user.name}
          </p>
          <p>
            <strong>Email:</strong> {session.user.email}
          </p>
        </div>
      </div>
    </div>
  );
}

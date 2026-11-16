"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth-client";

export function SignOutButton() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending) {
    return <Button variant="neutral" disabled>Loading...</Button>;
  }

  if (!session) {
    return null;
  }

  return (
    <Button
      variant="neutral"
      onClick={async () => {
        await signOut();
        router.replace("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/dashboard");
  }

  await searchParams;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Welcome to Secret Santa</CardTitle>
          <CardDescription>Create your account or sign in with Google or an approved email address.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <SignInButton />
        </CardContent>
      </Card>
    </div>
  );
}

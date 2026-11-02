import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/config/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const demo = env().mockDb;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">HR Recruiting</CardTitle>
          <CardDescription>Sign in to manage jobs, candidates and emails.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
          {demo ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Demo mode: use the MOCK_ADMIN_EMAIL and MOCK_ADMIN_PASSWORD from your .env.local file.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

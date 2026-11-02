"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const config = /DATABASE_URL|MOCK_DB|not set|Supabase/i.test(error.message);
  return (
    <div className="mx-auto max-w-xl space-y-4 py-12">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <Alert variant="error" title={config ? "The app is not fully set up" : "This page could not load"}>
        {config ? error.message : "Please try again. If it keeps happening, check the Activity Log or the setup guide (START_HERE.md)."}
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

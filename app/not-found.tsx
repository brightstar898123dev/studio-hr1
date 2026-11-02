import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">It may have been deleted, or the link is wrong.</p>
      <Link href="/" className="font-medium text-primary underline">
        Go to Home
      </Link>
    </main>
  );
}

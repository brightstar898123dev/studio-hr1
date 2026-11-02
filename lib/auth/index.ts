import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";
import { createMockSession, MOCK_SESSION_COOKIE, MOCK_SESSION_MAX_AGE, verifyMockSession } from "./mock-session";

export type User = { email: string };

async function supabase() {
  const e = env();
  if (!e.supabaseUrl || !e.supabaseAnonKey) return null;
  const store = await cookies();
  return createServerClient(e.supabaseUrl, e.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes cookies instead.
        }
      },
    },
  });
}

export async function getUser(): Promise<User | null> {
  const e = env();
  if (e.mockDb) {
    const store = await cookies();
    return verifyMockSession(store.get(MOCK_SESSION_COOKIE)?.value, e.mockAdminPassword);
  }
  const sb = await supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  const email = data.user?.email;
  if (!email) return null;
  if (e.allowedEmails.length && !e.allowedEmails.includes(email.toLowerCase())) return null;
  return { email };
}

/** Use at the top of every page and server action. Redirects to /login when signed out. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  const e = env();
  if (e.mockDb) {
    if (!e.mockAdminPassword) {
      return { error: "Demo login is not set up. Add MOCK_ADMIN_PASSWORD to your .env.local file." };
    }
    const ok =
      safeEqual(email.trim().toLowerCase(), e.mockAdminEmail.toLowerCase()) && safeEqual(password, e.mockAdminPassword);
    if (!ok) return { error: "That email or password is not right." };
    const store = await cookies();
    store.set(MOCK_SESSION_COOKIE, createMockSession(e.mockAdminEmail, e.mockAdminPassword), {
      httpOnly: true,
      sameSite: "lax",
      secure: e.appUrl.startsWith("https://"),
      path: "/",
      maxAge: MOCK_SESSION_MAX_AGE,
    });
    return {};
  }
  const sb = await supabase();
  if (!sb) return { error: "Login is not set up yet: the Supabase URL and anon key are missing." };
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { error: "That email or password is not right." };
  if (e.allowedEmails.length && !e.allowedEmails.includes(email.trim().toLowerCase())) {
    await sb.auth.signOut();
    return { error: "This account is not allowed to use the app. Ask the admin to add it to ALLOWED_EMAILS." };
  }
  return {};
}

export async function signOut(): Promise<void> {
  const e = env();
  const store = await cookies();
  if (e.mockDb) {
    store.delete(MOCK_SESSION_COOKIE);
    return;
  }
  const sb = await supabase();
  await sb?.auth.signOut();
}

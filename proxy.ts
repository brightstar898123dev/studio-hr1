import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { MOCK_SESSION_COOKIE, verifyMockSession } from "@/lib/auth/mock-session";

/**
 * Runs before every page. Keeps the login session fresh and sends signed-out
 * visitors to /login. Cron and webhook routes have their own secret checks.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/login" || pathname.startsWith("/api/cron/") || pathname.startsWith("/api/webhooks/");

  let response = NextResponse.next({ request });
  let signedIn = false;

  if (process.env.MOCK_DB === "true") {
    signedIn = !!verifyMockSession(request.cookies.get(MOCK_SESSION_COOKIE)?.value, process.env.MOCK_ADMIN_PASSWORD);
  } else if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    const allowed = (process.env.ALLOWED_EMAILS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    signedIn = !!data.user?.email && (allowed.length === 0 || allowed.includes(data.user.email.toLowerCase()));
  }

  if (isPublic) {
    if (pathname === "/login" && signedIn) return NextResponse.redirect(new URL("/", request.url));
    return response;
  }
  if (!signedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

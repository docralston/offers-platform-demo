import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAdmin } from "./lib/admin-allowlist";
import { isDemoMode } from "./lib/config/demo";

// Protect everything EXCEPT sign-in/up + Clerk internals.
// Add/remove public routes here as needed.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-out(.*)",
  "/sign-up(.*)", // keep if you use invites; otherwise remove
  "/sso-callback(.*)", // safe to include
  "/api/webhooks(.*)", // if you have Clerk/webhooks
  "/api/public(.*)", // embed widget + public offers JSON
  "/api/demo(.*)", // demo access-code sign-in
]);

// Admin routes (/admin and all subpaths) get an additional env-driven allowlist.
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

const allowedEmails = new Set(
  (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

function getEmailFromSessionClaims(sessionClaims: unknown): string {
  const claims = (sessionClaims ?? {}) as {
    email?: string;
    email_address?: string;
    primary_email_address?: string;
    primaryEmailAddress?: string;
    email_addresses?: Array<{ email_address?: string; emailAddress?: string }>;
  };

  const direct =
    claims.email ??
    claims.email_address ??
    claims.primary_email_address ??
    claims.primaryEmailAddress;
  if (typeof direct === "string" && direct.trim()) {
    return direct.toLowerCase();
  }

  const firstAddress = claims.email_addresses?.[0];
  const nested = firstAddress?.email_address ?? firstAddress?.emailAddress;
  if (typeof nested === "string" && nested.trim()) {
    return nested.toLowerCase();
  }

  return "";
}

export default clerkMiddleware(
  async (auth, req) => {
    if (isDemoMode()) {
      const path = req.nextUrl.pathname;
      if (path === '/demo' || path === '/demo/') {
        return NextResponse.redirect(new URL('/sign-in', req.url));
      }
    }

    // Let public routes through
    if (isPublicRoute(req)) return NextResponse.next();

    const { userId, sessionClaims } = await auth();

    // Not signed in → redirect to sign-in
    if (!userId) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }

    const primaryEmail = getEmailFromSessionClaims(sessionClaims);

    // Legacy bootstrap email allowlist for the whole app (if configured).
    if (!isDemoMode() && allowedEmails.size > 0) {
      if (!primaryEmail || !allowedEmails.has(primaryEmail)) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    // Env-driven admin allowlist for all /admin/* routes.
    if (isAdminRoute(req)) {
      const emailForAdminCheck = primaryEmail || null;
      if (!isAdmin(userId, emailForAdminCheck)) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    return NextResponse.next();
  },
  { jwtKey: process.env.CLERK_JWT_KEY }
);

export const config = {
  matcher: [
    // Run on everything except Next internals + static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

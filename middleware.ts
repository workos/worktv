import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import { isAuthEnabled } from "@/lib/auth/config";

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  // Skip auth in development if not forced
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  // Use authkit middleware for auth-enabled environments
  return authkitMiddleware()(request, event);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /auth/* (auth callback and sign-in routes)
     * - /_next/* (Next.js internals)
     * - /favicon.ico, /logo.png, etc. (static files)
     * - files with extensions (e.g., .js, .css, .png)
     */
    "/((?!auth/|_next/|favicon\\.ico|logo\\.png|.*\\..*).*)",
  ],
};

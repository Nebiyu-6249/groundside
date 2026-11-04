// Sends signed-out visitors of the ops console to /login before anything renders. Pages and
// server actions still check the session and role themselves (SPEC 13); this is the first gate.

import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("gs_session")?.value;
  const secret = process.env.SESSION_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
      return NextResponse.next();
    } catch {
      // Expired or tampered: fall through to the redirect.
    }
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/ops/:path*", "/api/disruptions/:path*", "/api/ops/:path*"],
};

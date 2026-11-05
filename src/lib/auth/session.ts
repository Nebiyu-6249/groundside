// Ops sessions: a signed (HS256) httpOnly cookie with the user ID and role. The user is
// re-read from the database on every request, so a deleted user loses access at once.

import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";

export const SESSION_COOKIE = "gs_session";
const SESSION_HOURS = 12;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "DUTY_MANAGER" | "VIEWER";
  /** Set for judge-mode users: they see only this run (SPEC 13). */
  judgeRunId: string | null;
}

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters)");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string, role: string): Promise<void> {
  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await getDb().user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, name: true, role: true, judgeRunId: true } });
    return user;
  } catch {
    return null;
  }
}

/** For ops pages and server actions: redirects to /login without a session. */
export async function requireUser(role?: SessionUser["role"]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect("/ops?error=forbidden");
  return user;
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/ops/audit";
import { hit } from "@/lib/rate-limit";
import { ipHash } from "@/lib/request";

export interface LoginState {
  error: string | null;
}

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const db = getDb();
  const limit = await hit(db, `login:${await ipHash()}`, 10, 15 * 60);
  if (!limit.allowed) return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Compare even when the user is missing so timing does not reveal which emails exist.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!user || !ok) return { error: "Email or password is not correct." };

  await createSession(user.id, user.role);
  await audit(db, { actorType: "USER", actorId: user.id, action: "LOGIN", entityType: "User", entityId: user.id, summary: `${user.name} signed in` });
  redirect("/ops");
}

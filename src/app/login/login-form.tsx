"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ demoEmail }: { demoEmail: string | null }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });
  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={demoEmail ?? ""} className="mt-1 w-full rounded border border-line bg-surface px-3 py-2" />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded border border-line bg-surface px-3 py-2" />
      </div>
      {state.error ? <p role="alert" className="text-sm text-red">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded bg-amber px-4 py-2 font-medium text-ink disabled:opacity-60">
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}

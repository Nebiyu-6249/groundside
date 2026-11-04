import type { Metadata } from "next";
import { DEFAULT_DEMO_EMAIL } from "@/lib/auth/users";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in - Groundside" };

export default function LoginPage() {
  const judgeMode = process.env.JUDGE_MODE === "true";
  const demoEmail = judgeMode ? process.env.DEMO_OPS_EMAIL || DEFAULT_DEMO_EMAIL : null;
  return (
    <div data-theme="dark" className="flex flex-1 items-center justify-center px-4 py-16">
      <main className="w-full max-w-sm">
        <p className="font-mono text-sm text-muted">Groundside</p>
        <h1 className="mt-1 text-2xl font-semibold">Duty manager sign in</h1>
        <p className="mt-2 text-sm text-muted">Demo data. Fictional airline. PayPal sandbox only.</p>
        {judgeMode ? (
          <p className="mt-4 rounded border border-line p-3 text-sm">Judges: the demo duty manager credentials are listed in the README.</p>
        ) : null}
        <LoginForm demoEmail={demoEmail} />
      </main>
    </div>
  );
}

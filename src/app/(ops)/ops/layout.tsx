import Link from "next/link";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth/session";
import { logout } from "./actions";

async function UserBox() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <form action={logout} className="flex items-center gap-3 text-sm">
      <span className="text-muted">{user.name}</span>
      <button type="submit" className="rounded border border-line px-2 py-1 hover:border-amber">Sign out</button>
    </form>
  );
}

export default function OpsLayout({ children }: LayoutProps<"/ops">) {
  return (
    <div data-theme="dark" className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <nav className="flex items-center gap-6 text-sm" aria-label="Ops">
          <Link href="/ops" className="font-mono font-medium">Groundside</Link>
          <Link href="/ops" className="text-muted hover:text-foreground">Disruptions</Link>
          <Link href="/ops/outbox" className="text-muted hover:text-foreground">Outbox</Link>
          <span className="rounded border border-line px-1.5 py-0.5 text-xs text-muted">Demo data. PayPal sandbox.</span>
        </nav>
        <Suspense fallback={null}>
          <UserBox />
        </Suspense>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}

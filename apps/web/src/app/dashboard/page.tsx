import type { Metadata } from "next";
import { SignOutButton } from "@/components/auth/auth-forms";
import { requireSession } from "@/lib/server/session";

// Session-dependent: never prerender at build time (it would open the local D1 from several
// build workers at once and fail with SQLITE_BUSY).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard · Truframe" };

export default async function DashboardPage() {
  const { user } = await requireSession();
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <span className="font-semibold">Truframe</span>
        <div className="flex items-center gap-3 text-sm">
          <span data-testid="signed-in-email">{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
    </main>
  );
}

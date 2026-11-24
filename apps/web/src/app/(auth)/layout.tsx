import type { ReactNode } from "react";

// Session-dependent: never prerender at build time (it would open the local D1 from several
// build workers at once and fail with SQLITE_BUSY).
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <a href="/" className="text-sm font-semibold">
        Truframe
      </a>
      {children}
    </main>
  );
}

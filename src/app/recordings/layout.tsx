import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { getAuthSession } from "@/lib/auth/server";
import { SearchProvider } from "./search-context";

export default async function RecordingsLayout({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = await getAuthSession();
  return (
    <SearchProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-50 transition-colors light:bg-zinc-100 light:text-zinc-900">
        <header className="border-b border-white/10 bg-zinc-900/50 transition-colors light:border-zinc-200 light:bg-white">
          <div className="mx-auto flex max-w-7xl items-center px-6 py-4">
            <Link href="/recordings" className="flex-shrink-0">
              <Image
                src="/logo.png"
                alt="WorkTV"
                width={64}
                height={64}
                className="h-16 w-16"
              />
            </Link>
            <div className="flex flex-1 justify-center">
              <h1 className="text-xl font-semibold text-zinc-50 light:text-zinc-900">
                Let&apos;s watch WorkTV
              </h1>
            </div>
            <div id="nav-title" />
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {isAuthenticated && user && <UserMenu user={user} />}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </div>
    </SearchProvider>
  );
}

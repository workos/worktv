import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function RecordingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 transition-colors light:bg-zinc-100 light:text-zinc-900">
      <header className="border-b border-white/10 bg-zinc-900/50 transition-colors light:border-zinc-200 light:bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/recordings" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="WorkTV"
              width={64}
              height={64}
              className="h-16 w-16"
            />
            <span className="text-sm font-semibold">WorkTV</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

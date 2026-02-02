"use client";

import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthKitProvider>{children}</AuthKitProvider>;
}

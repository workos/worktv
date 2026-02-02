"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";

export function useAuthSession() {
  const auth = useAuth();
  return {
    user: auth.user,
    isLoading: auth.loading,
    isAuthenticated: !!auth.user,
    signOut: auth.signOut,
  };
}

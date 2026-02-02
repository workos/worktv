import { withAuth, getSignInUrl, getSignUpUrl, signOut } from "@workos-inc/authkit-nextjs";
import { isAuthEnabled, DEV_MOCK_USER } from "./config";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
}

export interface AuthSession {
  user: AuthUser | null;
  isAuthenticated: boolean;
}

/**
 * Get the current auth session.
 * In development with auth disabled, returns a mock user.
 * In production or with FORCE_AUTH_IN_DEV=true, returns the real session.
 */
export async function getAuthSession(): Promise<AuthSession> {
  if (!isAuthEnabled()) {
    // Return mock user in development when auth is disabled
    return {
      user: DEV_MOCK_USER,
      isAuthenticated: true,
    };
  }

  try {
    const { user } = await withAuth();
    return {
      user: user
        ? {
            id: user.id,
            email: user.email ?? "",
            firstName: user.firstName ?? undefined,
            lastName: user.lastName ?? undefined,
            profilePictureUrl: user.profilePictureUrl ?? undefined,
          }
        : null,
      isAuthenticated: !!user,
    };
  } catch {
    return {
      user: null,
      isAuthenticated: false,
    };
  }
}

/**
 * Require authentication. Throws if not authenticated.
 * In development with auth disabled, returns a mock user.
 */
export async function requireAuth(): Promise<AuthUser> {
  if (!isAuthEnabled()) {
    return DEV_MOCK_USER;
  }

  const { user } = await withAuth({ ensureSignedIn: true });
  // ensureSignedIn redirects unauthenticated users, but TypeScript doesn't know that
  if (!user) {
    throw new Error("Authentication required");
  }

  return {
    id: user.id,
    email: user.email ?? "",
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    profilePictureUrl: user.profilePictureUrl ?? undefined,
  };
}

// Re-export useful functions from authkit
export { getSignInUrl, getSignUpUrl, signOut };

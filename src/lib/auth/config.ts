/**
 * Auth configuration for WorkOS AuthKit
 *
 * In development (NODE_ENV=development), auth is bypassed by default for convenience.
 * Set FORCE_AUTH_IN_DEV=true to test full auth workflow in development.
 * In production, auth is always enforced.
 */

export function isAuthEnabled(): boolean {
  // Always enforce auth in production
  if (process.env.NODE_ENV === "production") {
    return true;
  }

  // In development, auth is bypassed unless explicitly enabled
  return process.env.FORCE_AUTH_IN_DEV === "true";
}

export function isAuthConfigured(): boolean {
  return !!(
    process.env.WORKOS_CLIENT_ID &&
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_COOKIE_PASSWORD
  );
}

// Mock user for development when auth is disabled
export const DEV_MOCK_USER = {
  id: "dev-user",
  email: "developer@localhost",
  firstName: "Dev",
  lastName: "User",
  // Using undefined so the avatar falls back to initials (no external dependency)
  profilePictureUrl: undefined,
};

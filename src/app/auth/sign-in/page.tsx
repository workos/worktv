import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { isAuthEnabled } from "@/lib/auth/config";

export default async function SignInPage() {
  // If auth is disabled in dev, redirect to recordings
  if (!isAuthEnabled()) {
    redirect("/recordings");
  }

  // Get the AuthKit sign-in URL and redirect
  const signInUrl = await getSignInUrl();
  redirect(signInUrl);
}

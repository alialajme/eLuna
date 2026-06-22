const isDev = process.env.NODE_ENV !== "production";

export async function safeCurrentUser() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    if (!isDev) throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required in production");
    return null; // dev-only: treat everyone as guest
  }
  const { currentUser } = await import("@clerk/nextjs/server");
  return currentUser();
}

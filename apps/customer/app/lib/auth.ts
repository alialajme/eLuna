export async function safeCurrentUser() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  const { currentUser } = await import("@clerk/nextjs/server");
  return currentUser();
}

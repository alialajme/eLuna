import { currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";

export async function safeCurrentUser(): Promise<User | null> {
  try {
    return await currentUser();
  } catch {
    return null;
  }
}

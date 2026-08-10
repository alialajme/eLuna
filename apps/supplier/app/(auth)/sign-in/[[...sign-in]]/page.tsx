import { SignIn } from "@clerk/nextjs";

export default function SupplierSignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <SignIn />
    </main>
  );
}

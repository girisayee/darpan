import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Logo } from "@/components/common/Logo";

export default async function SignIn() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="flex flex-col items-center gap-3">
        <Logo size={44} showWordmark />
        <p className="text-strong text-muted-foreground">The mirror for your trades.</p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-[10px] border border-hairline bg-surface px-4 py-2.5 text-strong font-medium text-foreground hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Continue with Google
        </button>
      </form>
      <p className="text-caption text-muted-foreground">Access is invite-only.</p>
    </main>
  );
}

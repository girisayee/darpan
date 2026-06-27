import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const { name, email, image } = session.user;
  return (
    <DashboardShell user={{ name: name ?? null, email: email ?? null, image: image ?? null }}>
      {children}
    </DashboardShell>
  );
}

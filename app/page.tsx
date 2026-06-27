import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return <DashboardApp />;
}

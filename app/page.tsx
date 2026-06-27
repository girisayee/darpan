import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const { name, email, image } = session.user;
  return <DashboardApp user={{ name: name ?? null, email: email ?? null, image: image ?? null }} />;
}

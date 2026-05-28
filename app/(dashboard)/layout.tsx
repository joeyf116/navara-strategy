import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { QueryProvider } from "@/lib/query-provider";
import { SessionProvider } from "@/components/session-provider";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();

	if (!session?.user) {
		redirect("/login");
	}

	return (
		<SessionProvider session={session}>
			<QueryProvider>
				<div className="min-h-screen bg-background">
					<DashboardSidebar />
					<main className="lg:pl-64">
						<div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
					</main>
				</div>
			</QueryProvider>
		</SessionProvider>
	);
}

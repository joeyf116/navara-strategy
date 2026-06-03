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
					<main className="lg:pl-60">
						<div className="mx-auto w-full max-w-[1480px] px-3 py-4 sm:px-4 lg:px-5">
							{children}
						</div>
					</main>
				</div>
			</QueryProvider>
		</SessionProvider>
	);
}

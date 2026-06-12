import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { QueryProvider } from "@/lib/query-provider";
import { SessionProvider } from "@/components/session-provider";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";

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
				<SidebarProvider>
					<AppSidebar />
					<SidebarInset>
						<header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
							<SidebarTrigger className="-ml-1" />
							<Separator orientation="vertical" className="mr-1 !h-4" />
							<span className="text-sm font-medium text-muted-foreground">
								Navara Portal
							</span>
						</header>
						<div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
							{children}
						</div>
					</SidebarInset>
				</SidebarProvider>
			</QueryProvider>
		</SessionProvider>
	);
}

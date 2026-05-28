"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
	LayoutDashboard,
	Users,
	FolderOpen,
	Cog,
	Activity,
	AlertTriangle,
	ClipboardList,
	Heart,
	Database,
	Inbox,
	Moon,
	Sun,
	LogOut,
	Menu,
	X,
	ShieldAlert,
	FileCheck,
	ArrowRightLeft,
	Upload,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const navigation = [
	{ name: "Dashboard", href: "/", icon: LayoutDashboard },
	{ name: "Tenants", href: "/tenants", icon: Users },
	{ name: "File Explorer", href: "/files", icon: FolderOpen },
	{ name: "Web Uploads", href: "/uploads", icon: Upload },
	{ name: "Ingestion Jobs", href: "/ingestion", icon: Activity },
	{ name: "Validation", href: "/validation", icon: FileCheck },
	{ name: "Anomaly Detection", href: "/anomalies", icon: ShieldAlert },
	{ name: "Reconciliation", href: "/reconciliation", icon: ArrowRightLeft },
	{ name: "Queue Monitoring", href: "/queues", icon: Inbox },
	{ name: "Failed Processing", href: "/failed", icon: AlertTriangle },
	{ name: "Audit Logs", href: "/audit", icon: ClipboardList },
	{ name: "Service Health", href: "/health", icon: Heart },
	{ name: "Database Insights", href: "/database", icon: Database },
	{ name: "Settings", href: "/settings", icon: Cog },
];

function roleBadgeLabel(role: string | undefined): string {
	switch (role) {
		case "super_admin":
			return "Super Admin";
		case "admin":
			return "Admin";
		case "tenant_user":
			return "Tenant";
		case "read_only_auditor":
			return "Auditor";
		default:
			return "User";
	}
}

function getInitials(name: string | undefined | null): string {
	if (!name) return "U";
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function DashboardSidebar() {
	const pathname = usePathname();
	const { theme, setTheme } = useTheme();
	const { data: session } = useSession();
	const [mobileOpen, setMobileOpen] = useState(false);

	const user = session?.user;

	const sidebarContent = (
		<>
			<div className="flex h-14 items-center px-4">
				<Link href="/" className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
						<span className="text-sm font-bold text-primary-foreground">N</span>
					</div>
					<span className="text-lg font-semibold">Navara</span>
				</Link>
				<Button
					variant="outline"
					size="sm"
					className="ml-auto lg:hidden"
					onClick={() => setMobileOpen(false)}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
			<Separator />
			<ScrollArea className="flex-1 px-3 py-2">
				<nav className="flex flex-col gap-1">
					{navigation.map((item) => {
						const isActive =
							item.href === "/"
								? pathname === "/"
								: pathname.startsWith(item.href);
						return (
							<Link
								key={item.name}
								href={item.href}
								onClick={() => setMobileOpen(false)}
								className={cn(
									"flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
									isActive
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
								)}
							>
								<item.icon className="h-4 w-4" />
								{item.name}
							</Link>
						);
					})}
				</nav>
			</ScrollArea>
			<Separator />
			<div className="p-3 space-y-2">
				<Button
					variant="outline"
					size="sm"
					className="w-full justify-start gap-2"
					onClick={() => {
						if (theme === "system") setTheme("dark");
						else if (theme === "dark") setTheme("light");
						else setTheme("system");
					}}
				>
					<Sun className="h-4 w-4 dark:hidden" />
					<Moon className="h-4 w-4 hidden dark:block" />
					{theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light"}
				</Button>
				<div className="flex items-center gap-2 rounded-md px-3 py-2">
					<Avatar className="h-8 w-8">
						<AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
					</Avatar>
					<div className="flex-1 min-w-0">
						<p className="truncate text-sm font-medium">
							{user?.name ?? "User"}
						</p>
						<div className="flex items-center gap-1.5">
							<p className="truncate text-xs text-muted-foreground">
								{user?.email ?? ""}
							</p>
						</div>
						<Badge variant="outline" className="mt-0.5 text-[10px] px-1.5 py-0">
							{roleBadgeLabel(user?.role)}
						</Badge>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => signOut({ callbackUrl: "/login" })}
						title="Sign out"
					>
						<LogOut className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
		</>
	);

	return (
		<>
			{/* Mobile menu button */}
			<Button
				variant="outline"
				size="sm"
				className="fixed left-4 top-3 z-50 lg:hidden"
				onClick={() => setMobileOpen(true)}
			>
				<Menu className="h-4 w-4" />
			</Button>

			{/* Mobile overlay */}
			{mobileOpen && (
				<div
					className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
					onClick={() => setMobileOpen(false)}
				/>
			)}

			{/* Mobile sidebar */}
			<aside
				className={cn(
					"fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform lg:hidden",
					mobileOpen ? "translate-x-0" : "-translate-x-full",
				)}
			>
				{sidebarContent}
			</aside>

			{/* Desktop sidebar */}
			<aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border lg:bg-card">
				{sidebarContent}
			</aside>
		</>
	);
}

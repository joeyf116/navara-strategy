"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
	Moon,
	Sun,
	LogOut,
	Loader2,
	Menu,
	X,
	FolderTree,
	FileSpreadsheet,
	Settings,
} from "lucide-react";
import { useSyncExternalStore, useState } from "react";

import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const navigation = [
	{ name: "Files", href: "/files", icon: FolderTree },
	{ name: "Imports", href: "/uploads", icon: FileSpreadsheet },
	{ name: "Settings", href: "/settings", icon: Settings },
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
		.filter((n) => n.length > 0)
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
	const [signingOut, setSigningOut] = useState(false);
	const mounted = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);

	const user = session?.user;

	async function handleSignOut() {
		if (signingOut) return;
		setSigningOut(true);

		let destination = "/login";
		try {
			const response = await fetch("/api/auth/logout-url", {
				cache: "no-store",
			});
			if (response.ok) {
				const payload = (await response.json().catch(() => ({}))) as {
					logoutUrl?: string;
				};
				destination = payload.logoutUrl || "/login";
			}
		} catch {
			destination = "/login";
		}

		try {
			await signOut({ redirect: false, callbackUrl: "/login" });
		} finally {
			window.location.href = destination;
		}
	}

	const sidebarContent = (
		<>
			<div className="flex h-12 items-center px-3">
				<Link href="/files" className="flex items-center gap-2">
					<div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
						<span className="text-xs font-bold text-primary-foreground">N</span>
					</div>
					<span className="text-sm font-semibold tracking-tight">
						Navara Files
					</span>
				</Link>
				<Button
					variant="outline"
					size="sm"
					className="ml-auto h-7 w-7 p-0 lg:hidden"
					onClick={() => setMobileOpen(false)}
					aria-label="Close navigation"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
			<Separator />
			<ScrollArea className="flex-1 px-2.5 py-2">
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
									"flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
									isActive
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
								)}
							>
								<item.icon className="h-3.5 w-3.5" />
								{item.name}
							</Link>
						);
					})}
				</nav>
			</ScrollArea>
			<Separator />
			<div className="space-y-1.5 p-2.5">
				<Button
					variant="outline"
					size="sm"
					className="h-8 w-full justify-start gap-2 text-xs"
					onClick={() => {
						if (theme === "system") setTheme("dark");
						else if (theme === "dark") setTheme("light");
						else setTheme("system");
					}}
				>
					{mounted ? (
						<>
							<Sun className="h-4 w-4 dark:hidden" aria-hidden />
							<Moon className="h-4 w-4 hidden dark:block" aria-hidden />
							{theme === "system"
								? "System"
								: theme === "dark"
									? "Dark"
									: "Light"}
						</>
					) : (
						<span className="h-4 w-4" />
					)}
				</Button>
				<div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5">
					<Avatar className="h-7 w-7">
						<AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1">
						<p className="truncate text-xs font-medium">
							{user?.name ?? "User"}
						</p>
						<div className="flex items-center gap-1">
							<p className="truncate text-[11px] text-muted-foreground">
								{user?.email ?? ""}
							</p>
						</div>
						<Badge variant="outline" className="mt-0.5 px-1 py-0 text-[10px]">
							{roleBadgeLabel(user?.role)}
						</Badge>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="h-7 w-7 p-0"
						onClick={() => void handleSignOut()}
						disabled={signingOut}
						aria-label="Sign out"
						title="Sign out"
					>
						{signingOut ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<LogOut className="h-3.5 w-3.5" />
						)}
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
				className="fixed left-3 top-3 z-50 h-8 w-8 p-0 lg:hidden"
				onClick={() => setMobileOpen(true)}
				aria-label="Open navigation"
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
					"fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-card/95 backdrop-blur transition-transform lg:hidden",
					mobileOpen ? "translate-x-0" : "-translate-x-full",
				)}
			>
				{sidebarContent}
			</aside>

			{/* Desktop sidebar */}
			<aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-border lg:bg-card">
				{sidebarContent}
			</aside>
		</>
	);
}

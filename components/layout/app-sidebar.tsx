"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
	ChevronsUpDown,
	FileSpreadsheet,
	FolderTree,
	LayoutDashboard,
	LogOut,
	Monitor,
	Moon,
	Settings,
	Sun,
	Users,
} from "lucide-react";

import { canAccessFeature, type Feature } from "@/lib/rbac";
import { useTheme } from "@/lib/theme";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";

const navigation: {
	name: string;
	href: string;
	icon: typeof FolderTree;
	feature: Feature;
}[] = [
	{ name: "Dashboard", href: "/", icon: LayoutDashboard, feature: "dashboard:view" },
	{ name: "Files", href: "/files", icon: FolderTree, feature: "files:view" },
	{ name: "Imports", href: "/uploads", icon: FileSpreadsheet, feature: "imports:view" },
	{ name: "Users", href: "/users", icon: Users, feature: "admin:users" },
	{ name: "Settings", href: "/settings", icon: Settings, feature: "settings:view" },
];

function roleLabel(role: string | undefined): string {
	switch (role) {
		case "super_admin":
			return "Super Admin";
		case "admin":
			return "Admin";
		case "tenant_user":
			return "Client";
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
		.filter((part) => part.length > 0)
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function AppSidebar() {
	const pathname = usePathname();
	const { theme, setTheme } = useTheme();
	const { data: session } = useSession();
	const { isMobile, setOpenMobile } = useSidebar();
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

		// Resolve the Cognito hosted-UI logout URL so the IdP session ends too.
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

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="lg"
							render={<Link href="/" />}
						>
							<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary">
								<span className="text-sm font-bold text-primary-foreground">
									N
								</span>
							</div>
							<div className="flex min-w-0 flex-col leading-tight">
								<span className="truncate text-sm font-semibold">
									Navara Portal
								</span>
								<span className="truncate text-xs text-muted-foreground">
									Secure file exchange
								</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{navigation
								.filter((item) =>
									canAccessFeature(user?.role, item.feature),
								)
								.map((item) => {
								const isActive =
									item.href === "/"
										? pathname === "/"
										: pathname.startsWith(item.href);
								return (
									<SidebarMenuItem key={item.name}>
										<SidebarMenuButton
											isActive={isActive}
											tooltip={item.name}
											render={
												<Link
													href={item.href}
													aria-current={isActive ? "page" : undefined}
													onClick={() => {
														if (isMobile) setOpenMobile(false);
													}}
												/>
											}
										>
											<item.icon aria-hidden="true" />
											<span>{item.name}</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<SidebarMenuButton
										size="lg"
										aria-label="Account menu"
									/>
								}
							>
								<Avatar className="size-8">
									<AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
								</Avatar>
								<div className="flex min-w-0 flex-col leading-tight">
									<span className="truncate text-sm font-medium">
										{user?.name ?? "User"}
									</span>
									<span className="truncate text-xs text-muted-foreground">
										{user?.email ?? ""}
									</span>
								</div>
								<ChevronsUpDown
									className="ml-auto size-4 text-muted-foreground"
									aria-hidden="true"
								/>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								side={isMobile ? "top" : "right"}
								align="end"
								className="w-56"
							>
								<DropdownMenuGroup>
									<DropdownMenuLabel className="font-normal">
										<div className="flex min-w-0 flex-col">
											<span className="truncate text-sm font-medium text-foreground">
												{user?.name ?? "User"}
											</span>
											<span className="truncate text-xs text-muted-foreground">
												{user?.email ?? ""}
											</span>
											<span className="mt-0.5 text-xs text-muted-foreground">
												{roleLabel(user?.role)}
											</span>
										</div>
									</DropdownMenuLabel>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuLabel>Theme</DropdownMenuLabel>
									<DropdownMenuRadioGroup
										value={mounted ? (theme ?? "system") : "system"}
										onValueChange={setTheme}
									>
										<DropdownMenuRadioItem value="light">
											<Sun aria-hidden="true" />
											Light
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="dark">
											<Moon aria-hidden="true" />
											Dark
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="system">
											<Monitor aria-hidden="true" />
											System
										</DropdownMenuRadioItem>
									</DropdownMenuRadioGroup>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuItem
										onClick={() => void handleSignOut()}
										disabled={signingOut}
									>
										{signingOut ? (
											<Spinner aria-hidden="true" />
										) : (
											<LogOut aria-hidden="true" />
										)}
										Sign out
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}

"use client";

import { useSession } from "next-auth/react";

import { PageHeader } from "@/components/common/page-header";
import { AccountAccessCard } from "@/components/features/dashboard/account-access-card";
import { RecentFilesCard } from "@/components/features/dashboard/recent-files-card";
import { UserAccessSummaryCard } from "@/components/features/dashboard/user-access-summary-card";
import { hasRole } from "@/lib/rbac";

// Overview = summaries and previews only. Full data lives on its canonical
// page: files on /files, imports on /uploads, connection setup on /settings,
// user management on /users (super admin).
export default function DashboardPage() {
	const { data: session } = useSession();
	const user = session?.user;
	const firstName = user?.name?.split(" ")[0];

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
				description="Recent activity and the status of your account."
			/>

			<div className="grid gap-6 lg:grid-cols-2">
				<RecentFilesCard />
				<AccountAccessCard />
				{hasRole(user?.role, "super_admin") ? <UserAccessSummaryCard /> : null}
			</div>
		</div>
	);
}

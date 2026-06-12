import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/rbac";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/shared/access-denied";
import { UserAccessManagementTable } from "@/components/features/settings/user-access-management-table";

// Canonical home for global user/company access management (super admin).
// Server-side guard: the backing APIs additionally reject non-super-admin
// sessions, so this page is defense-in-depth, not the only boundary.
export default async function UsersPage() {
	const session = await auth();

	if (!hasRole(session?.user?.role, "super_admin")) {
		return <AccessDenied description="User access management is restricted to super administrators." />;
	}

	return (
		<div className="flex flex-col gap-8">
			<PageHeader
				title="User access"
				description="Manage Cognito users and their company-level portal, WebDAV, and SFTP permissions."
			/>
			<UserAccessManagementTable />
		</div>
	);
}

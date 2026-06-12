// Centralized RBAC configuration and helpers.
//
// This module is intentionally framework-free (no next-auth / server imports)
// so it can be used from both server components/route handlers and client
// components. Role assignment itself happens in lib/auth.ts (Cognito groups →
// UserRole); server-side enforcement lives in the API route handlers — UI
// checks here are for navigation/rendering only, never the security boundary.

import type { UserRole } from "@/lib/types";

export type Feature =
	| "dashboard:view"
	| "files:view"
	| "files:manage"
	| "imports:view"
	| "imports:upload"
	| "settings:view"
	| "settings:app-passwords"
	| "admin:users"
	| "admin:database";

export const rolePermissions: Record<UserRole, readonly (Feature | "*")[]> = {
	super_admin: ["*"],
	admin: [
		"dashboard:view",
		"files:view",
		"files:manage",
		"imports:view",
		"imports:upload",
		"settings:view",
		"settings:app-passwords",
	],
	tenant_user: [
		"dashboard:view",
		"files:view",
		"imports:view",
		"imports:upload",
		"settings:view",
		"settings:app-passwords",
	],
	read_only_auditor: [
		"dashboard:view",
		"files:view",
		"imports:view",
		"settings:view",
	],
};

export function hasRole(
	role: UserRole | undefined,
	required: UserRole,
): boolean {
	return role === required;
}

export function hasAnyRole(
	role: UserRole | undefined,
	required: readonly UserRole[],
): boolean {
	return role !== undefined && required.includes(role);
}

export function canAccessFeature(
	role: UserRole | undefined,
	feature: Feature,
): boolean {
	if (!role) return false;
	const permissions = rolePermissions[role];
	return permissions.includes("*") || permissions.includes(feature);
}

export function isAdminRole(role: UserRole | undefined): boolean {
	return hasAnyRole(role, ["super_admin", "admin"]);
}

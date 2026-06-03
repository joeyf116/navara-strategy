import NextAuth from "next-auth";
import Cognito from "next-auth/providers/cognito";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import type { UserRole } from "@/lib/types";

declare module "next-auth" {
	interface User {
		role: UserRole;
		tenantId?: string;
	}
	interface Session {
		user: {
			id: string;
			name: string;
			email: string;
			role: UserRole;
			tenantId?: string;
		};
	}
}

declare module "@auth/core/jwt" {
	interface JWT {
		role: UserRole;
		tenantId?: string;
	}
}

// Dev mode demo users for local RBAC testing
export const DEV_USERS = [
	{
		id: "1",
		name: "Super Admin",
		email: "superadmin@navara.io",
		password: "demo",
		role: "super_admin" as UserRole,
	},
	{
		id: "2",
		name: "Admin User",
		email: "admin@navara.io",
		password: "demo",
		role: "admin" as UserRole,
	},
	{
		id: "3",
		name: "Tenant User",
		email: "tenant@acme.com",
		password: "demo",
		role: "tenant_user" as UserRole,
		tenantId: "tenant-1",
	},
	{
		id: "4",
		name: "Auditor",
		email: "auditor@navara.io",
		password: "demo",
		role: "read_only_auditor" as UserRole,
	},
];

const isDevMode =
	process.env.NODE_ENV !== "production" ||
	process.env.NEXT_PUBLIC_DEV_MODE === "true";

function normalizeCognitoGroups(groupsClaim: unknown): string[] {
	if (Array.isArray(groupsClaim)) {
		return groupsClaim
			.filter((value): value is string => typeof value === "string")
			.map((value) => value.toLowerCase());
	}

	if (typeof groupsClaim === "string") {
		return groupsClaim
			.split(",")
			.map((value) => value.trim().toLowerCase())
			.filter(Boolean);
	}

	return [];
}

function roleFromCognitoProfile(profile: unknown): UserRole {
	const source = (profile ?? {}) as Record<string, unknown>;
	const groups = normalizeCognitoGroups(source["cognito:groups"]);

	if (groups.includes("super_admin")) return "super_admin";
	if (groups.includes("admin")) return "admin";
	if (groups.includes("read_only_auditor")) return "read_only_auditor";
	if (groups.includes("tenant_user")) return "tenant_user";

	// Safe default for any Cognito user not explicitly mapped.
	return "tenant_user";
}

// Build the list of providers based on environment
function buildProviders(): Provider[] {
	const providers: Provider[] = [];

	// Production: AWS Cognito
	if (process.env.AUTH_COGNITO_ID && process.env.AUTH_COGNITO_SECRET) {
		providers.push(
			Cognito({
				clientId: process.env.AUTH_COGNITO_ID,
				clientSecret: process.env.AUTH_COGNITO_SECRET,
				issuer: process.env.AUTH_COGNITO_ISSUER,
			}),
		);
	}

	// Dev mode: Credentials provider for local RBAC testing
	if (isDevMode) {
		providers.push(
			Credentials({
				id: "dev-credentials",
				name: "Dev Login",
				credentials: {
					email: { label: "Email", type: "email" },
					password: { label: "Password", type: "password" },
				},
				async authorize(credentials) {
					const user = DEV_USERS.find(
						(u) =>
							u.email === credentials?.email &&
							u.password === credentials?.password,
					);
					if (!user) return null;
					return {
						id: user.id,
						name: user.name,
						email: user.email,
						role: user.role,
						tenantId: user.tenantId,
					};
				},
			}),
		);
	}

	return providers;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
	providers: buildProviders(),
	callbacks: {
		jwt({ token, user, account, profile }) {
			if (user) {
				// Dev credentials already have role set
				if (user.role) {
					token.role = user.role;
					token.tenantId = user.tenantId;
				} else if (account?.provider === "cognito") {
					// Production OAuth — map Cognito groups to app roles with tenant-safe default.
					token.role = roleFromCognitoProfile(profile);
				}
			}
			return token;
		},
		session({ session, token }) {
			session.user.role = token.role;
			session.user.tenantId = token.tenantId;
			return session;
		},
	},
	pages: {
		signIn: "/login",
	},
	session: {
		strategy: "jwt",
	},
	secret: isDevMode
		? (process.env.NEXTAUTH_SECRET ?? "navara-dev-secret-change-in-production")
		: process.env.NEXTAUTH_SECRET,
});

// RBAC helper
export function hasPermission(role: UserRole, requiredRole: UserRole): boolean {
	const hierarchy: Record<UserRole, number> = {
		super_admin: 4,
		admin: 3,
		tenant_user: 2,
		read_only_auditor: 1,
	};
	return hierarchy[role] >= hierarchy[requiredRole];
}

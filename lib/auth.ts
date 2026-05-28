import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
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

const DEMO_USERS = [
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

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Demo Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const user = DEMO_USERS.find(
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
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
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
  secret:
    process.env.NEXTAUTH_SECRET ?? "navara-dev-secret-change-in-production",
});

// RBAC helper
export function hasPermission(
  role: UserRole,
  requiredRole: UserRole,
): boolean {
  const hierarchy: Record<UserRole, number> = {
    super_admin: 4,
    admin: 3,
    tenant_user: 2,
    read_only_auditor: 1,
  };
  return hierarchy[role] >= hierarchy[requiredRole];
}

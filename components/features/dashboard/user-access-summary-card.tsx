"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Users } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ManagedUser = {
	email: string;
	grants: { companyId: string }[];
};

// Super-admin only widget. The backing API rejects non-super-admin sessions
// server-side; this component is additionally gated by role in the page.
export function UserAccessSummaryCard() {
	const { data, isLoading, isError, refetch } = useQuery<{
		users: ManagedUser[];
	}>({
		queryKey: ["dashboard-user-access"],
		queryFn: async () => {
			const response = await fetch("/api/settings/company-access/users");
			if (!response.ok) throw new Error("Could not load users.");
			return response.json();
		},
	});

	const users = data?.users ?? [];
	const companies = new Set(
		users.flatMap((user) => user.grants.map((grant) => grant.companyId)),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>User &amp; company access</CardTitle>
				<CardDescription>
					Portal users and their company grants.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{isLoading ? (
					<div className="flex gap-3">
						<Skeleton className="h-16 w-full" />
						<Skeleton className="h-16 w-full" />
					</div>
				) : isError ? (
					<ErrorState
						title="Unable to load users"
						description="Something went wrong while loading user access."
						onRetry={() => void refetch()}
					/>
				) : users.length === 0 ? (
					<EmptyState
						icon={Users}
						title="No users found"
						description="Cognito users will appear here once created."
					/>
				) : (
					<div className="grid grid-cols-2 gap-3">
						<div className="rounded-lg border border-border p-3">
							<p className="text-2xl font-semibold">{users.length}</p>
							<p className="text-xs text-muted-foreground">Portal users</p>
						</div>
						<div className="rounded-lg border border-border p-3">
							<p className="text-2xl font-semibold">{companies.size}</p>
							<p className="text-xs text-muted-foreground">
								Companies with access grants
							</p>
						</div>
					</div>
				)}
				<div className="flex items-center gap-2">
					<Badge variant="outline" className="text-xs">
						Admin
					</Badge>
					<Button
						variant="ghost"
						size="sm"
						nativeButton={false}
						render={<Link href="/users" />}
					>
						Manage access
						<ArrowRight data-icon="inline-end" aria-hidden="true" />
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2 } from "lucide-react";

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

type ConnectionInfo = {
	userEmail: string;
	companies: string[];
	isSuperAdmin: boolean;
};

const MAX_BADGES = 8;

// Scoped account summary: which company workspaces this user can reach.
// Connection endpoints and setup instructions live canonically on /settings.
export function AccountAccessCard() {
	const { data, isLoading, isError, refetch } = useQuery<ConnectionInfo>({
		queryKey: ["connection-info"],
		queryFn: async () => {
			const response = await fetch("/api/settings/connection-info");
			if (!response.ok) throw new Error("Could not load account info.");
			return response.json();
		},
	});

	const companies = data?.companies ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Your access</CardTitle>
				<CardDescription>
					Company workspaces available to your account.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{isLoading ? (
					<div className="flex flex-wrap gap-2">
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton key={i} className="h-6 w-24" />
						))}
					</div>
				) : isError ? (
					<ErrorState
						title="Unable to load account info"
						description="Something went wrong while loading your access."
						onRetry={() => void refetch()}
					/>
				) : data?.isSuperAdmin ? (
					<p className="text-sm text-muted-foreground">
						Super administrator — full access to all company workspaces
						{companies.length > 0 ? ` (${companies.length} active)` : ""}.
					</p>
				) : companies.length === 0 ? (
					<EmptyState
						icon={Building2}
						title="No workspaces yet"
						description="An administrator needs to grant your account access to a company workspace."
					/>
				) : (
					<div className="flex flex-wrap gap-1.5">
						{companies.slice(0, MAX_BADGES).map((company) => (
							<Badge key={company} variant="outline">
								{company}
							</Badge>
						))}
						{companies.length > MAX_BADGES ? (
							<Badge variant="outline">
								+{companies.length - MAX_BADGES} more
							</Badge>
						) : null}
					</div>
				)}
				<Button
					variant="ghost"
					size="sm"
					className="self-start"
					nativeButton={false}
					render={<Link href="/settings" />}
				>
					Connect a drive or SFTP client
					<ArrowRight data-icon="inline-end" aria-hidden="true" />
				</Button>
			</CardContent>
		</Card>
	);
}

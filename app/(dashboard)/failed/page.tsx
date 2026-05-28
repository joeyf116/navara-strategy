"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, RotateCcw, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { FailedProcessing } from "@/lib/types";

const errorTypeVariant: Record<
	string,
	"destructive" | "warning" | "secondary" | "outline"
> = {
	validation: "destructive",
	parsing: "warning",
	database: "secondary",
	timeout: "warning",
	unknown: "outline",
};

export default function FailedPage() {
	const { data, isLoading, refetch, isFetching } = useQuery<{
		failures: FailedProcessing[];
	}>({
		queryKey: ["failed"],
		queryFn: () => fetch("/api/failed").then((r) => r.json()),
	});

	const failures = data?.failures ?? [];
	const retryable = failures.filter((f) => f.canRetry).length;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Failed Processing</h1>
					<p className="text-muted-foreground">
						Review and manage failed ingestion records
					</p>
				</div>
				<Button
					variant="outline"
					onClick={() => refetch()}
					disabled={isFetching}
				>
					{isFetching ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<RefreshCw className="h-4 w-4" />
					)}
					Refresh
				</Button>
			</div>

			<div className="grid gap-4 sm:grid-cols-3">
				<Card>
					<CardContent className="p-4">
						<p className="text-xs text-muted-foreground">Total Failures</p>
						<p className="text-2xl font-bold text-destructive">
							{failures.length}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<p className="text-xs text-muted-foreground">Retryable</p>
						<p className="text-2xl font-bold text-warning">{retryable}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<p className="text-xs text-muted-foreground">Non-Retryable</p>
						<p className="text-2xl font-bold">{failures.length - retryable}</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Failed Records</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="space-y-3">
							{Array.from({ length: 5 }).map((_, i) => (
								<Skeleton key={i} className="h-12 w-full" />
							))}
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>File</TableHead>
									<TableHead>Tenant</TableHead>
									<TableHead>Error Type</TableHead>
									<TableHead>Error Message</TableHead>
									<TableHead>Retries</TableHead>
									<TableHead>Failed At</TableHead>
									<TableHead className="w-20" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{failures.map((failure) => (
									<TableRow key={failure.id}>
										<TableCell className="font-medium">
											{failure.fileName}
											{failure.recordIndex !== null && (
												<span className="ml-1 text-xs text-muted-foreground">
													(row {failure.recordIndex})
												</span>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{failure.tenantName}
										</TableCell>
										<TableCell>
											<Badge variant={errorTypeVariant[failure.errorType]}>
												{failure.errorType}
											</Badge>
										</TableCell>
										<TableCell className="max-w-xs truncate text-sm text-muted-foreground">
											{failure.errorMessage}
										</TableCell>
										<TableCell>{failure.retryCount}</TableCell>
										<TableCell className="text-muted-foreground">
											{new Date(failure.failedAt).toLocaleString()}
										</TableCell>
										<TableCell>
											{failure.canRetry && (
												<Button variant="outline" size="sm">
													<RotateCcw className="h-3.5 w-3.5" />
													Retry
												</Button>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

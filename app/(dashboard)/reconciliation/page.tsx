"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import {
	CheckCircle,
	XCircle,
	AlertTriangle,
	RefreshCw,
	ArrowRightLeft,
	Clock,
	Search,
	ChevronDown,
	ChevronUp,
	Calendar,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type {
	ReconciliationSummary,
	ReconciliationJob,
	ReconciliationStatus,
} from "@/lib/reconciliation";

type ReconciliationData = {
	summary: ReconciliationSummary;
};

function JobStatusBadge({ status }: { status: ReconciliationJob["status"] }) {
	const config = {
		completed: { label: "Completed", variant: "outline" as const, className: "border-green-500 text-green-600 dark:text-green-400" },
		running: { label: "Running", variant: "secondary" as const, className: "border-blue-500 text-blue-600 dark:text-blue-400" },
		failed: { label: "Failed", variant: "destructive" as const, className: "" },
		scheduled: { label: "Scheduled", variant: "outline" as const, className: "" },
	};
	const c = config[status];
	return <Badge variant={c.variant} className={c.className}>{c.label}</Badge>;
}

function RecordStatusBadge({ status }: { status: ReconciliationStatus }) {
	const config = {
		matched: { label: "Matched", className: "bg-green-500/10 text-green-600 dark:text-green-400" },
		mismatched: { label: "Mismatched", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
		missing_source: { label: "Missing (Source)", className: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
		missing_target: { label: "Missing (Target)", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
		pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
	};
	const c = config[status];
	return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.className}`}>{c.label}</span>;
}

export default function ReconciliationPage() {
	const [search, setSearch] = useState("");
	const [expandedJob, setExpandedJob] = useState<string | null>(null);

	const { data, isLoading } = useQuery<ReconciliationData>({
		queryKey: ["reconciliation"],
		queryFn: () => fetch("/api/reconciliation").then((r) => r.json()),
	});

	if (isLoading || !data) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-bold">Reconciliation</h1>
					<p className="text-muted-foreground">
						Automated data reconciliation between source and target systems
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<Card key={i}>
							<CardContent className="p-4">
								<Skeleton className="h-12 w-full" />
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		);
	}

	const { summary } = data;
	const filteredJobs = summary.recentJobs.filter((j) =>
		j.name.toLowerCase().includes(search.toLowerCase()) ||
		j.tenantName.toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Reconciliation</h1>
				<p className="text-muted-foreground">
					Automated data reconciliation between source and target systems
				</p>
			</div>

			{/* Summary cards */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">Overall Match Rate</p>
								<p className="text-2xl font-bold">{summary.overallMatchRate}%</p>
							</div>
							<div className="rounded-lg bg-green-500/10 p-2.5">
								<CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">Records Reconciled</p>
								<p className="text-2xl font-bold">{summary.totalRecordsReconciled.toLocaleString()}</p>
							</div>
							<div className="rounded-lg bg-muted p-2.5">
								<ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">Discrepancies</p>
								<p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{summary.totalDiscrepancies}</p>
							</div>
							<div className="rounded-lg bg-yellow-500/10 p-2.5">
								<AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">Discrepancy Rate</p>
								<p className="text-2xl font-bold">{summary.discrepancyRate}%</p>
							</div>
							<div className="rounded-lg bg-yellow-500/10 p-2.5">
								<AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
				<div className="flex items-center gap-1.5 text-muted-foreground">
					<RefreshCw className="h-4 w-4" />
					Running jobs: <span className="font-medium text-foreground">{summary.runningJobs}</span>
				</div>
				<div className="text-muted-foreground">
					Failed jobs: <span className="font-medium text-destructive">{summary.failedJobs}</span>
				</div>
			</div>

			{/* Reconciliation jobs */}
			<Card>
				<CardHeader>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<CardTitle>Reconciliation Jobs</CardTitle>
						<div className="relative w-full sm:w-72">
							<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search by name or tenant..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="pl-8"
							/>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Job Name</TableHead>
								<TableHead>Tenant</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="hidden md:table-cell">Source → Target</TableHead>
								<TableHead>Match Rate</TableHead>
								<TableHead className="hidden lg:table-cell">Records</TableHead>
								<TableHead className="hidden lg:table-cell">Started</TableHead>
								<TableHead>Details</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredJobs.length === 0 ? (
								<TableRow>
									<TableCell colSpan={8} className="text-center text-muted-foreground">
										No reconciliation jobs found.
									</TableCell>
								</TableRow>
							) : (
								filteredJobs.map((job) => (
									<Fragment key={job.id}>
										<TableRow>
											<TableCell className="font-medium">{job.name}</TableCell>
											<TableCell>{job.tenantName}</TableCell>
											<TableCell>
												<JobStatusBadge status={job.status} />
											</TableCell>
											<TableCell className="hidden md:table-cell text-sm text-muted-foreground">
												{job.sourceSystem} → {job.targetSystem}
											</TableCell>
											<TableCell>
												{job.status === "scheduled" ? (
													<span className="text-muted-foreground">—</span>
												) : (
													<div className="flex items-center gap-1">
														<div className="h-2 w-16 rounded-full bg-muted">
															<div
																className={`h-2 rounded-full ${
																	job.matchRate >= 99
																		? "bg-green-500"
																		: job.matchRate >= 90
																			? "bg-yellow-500"
																			: "bg-red-500"
																}`}
																style={{ width: `${Math.min(100, job.matchRate)}%` }}
															/>
														</div>
														<span className="text-xs font-medium">
															{job.matchRate}%
														</span>
													</div>
												)}
											</TableCell>
											<TableCell className="hidden lg:table-cell text-sm">
												{job.totalRecords > 0 ? job.totalRecords.toLocaleString() : "—"}
											</TableCell>
											<TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
												<div className="flex items-center gap-1">
													{job.status === "scheduled" ? (
														<>
															<Calendar className="h-3 w-3" />
															{new Date(job.startedAt).toLocaleString()}
														</>
													) : (
														<>
															<Clock className="h-3 w-3" />
															{new Date(job.startedAt).toLocaleString()}
														</>
													)}
												</div>
											</TableCell>
											<TableCell>
												{job.records.length > 0 ? (
													<Button
														variant="outline"
														size="sm"
														onClick={() =>
															setExpandedJob(
																expandedJob === job.id ? null : job.id,
															)
														}
													>
														{expandedJob === job.id ? (
															<ChevronUp className="h-3.5 w-3.5" />
														) : (
															<ChevronDown className="h-3.5 w-3.5" />
														)}
													</Button>
												) : (
													<span className="text-xs text-muted-foreground">
														{job.status === "completed" ? (
															<span className="flex items-center gap-1 text-green-600 dark:text-green-400">
																<CheckCircle className="h-3.5 w-3.5" />
																All matched
															</span>
														) : job.status === "failed" ? (
															<span className="flex items-center gap-1 text-destructive">
																<XCircle className="h-3.5 w-3.5" />
																See errors
															</span>
														) : (
															"—"
														)}
													</span>
												)}
											</TableCell>
										</TableRow>
										{expandedJob === job.id && job.records.length > 0 && (
											<TableRow key={`${job.id}-details`}>
												<TableCell colSpan={8} className="bg-muted/50 p-0">
													<div className="p-4">
														<h4 className="mb-3 text-sm font-semibold">
															Discrepancies ({job.records.length})
														</h4>
														<Table>
															<TableHeader>
																<TableRow>
																	<TableHead>Status</TableHead>
																	<TableHead>Field</TableHead>
																	<TableHead>Source Value</TableHead>
																	<TableHead>Target Value</TableHead>
																	<TableHead className="hidden md:table-cell">Discrepancy</TableHead>
																</TableRow>
															</TableHeader>
															<TableBody>
																{job.records.map((record) => (
																	<TableRow key={record.id}>
																		<TableCell>
																			<RecordStatusBadge status={record.status} />
																		</TableCell>
																		<TableCell>
																			<code className="rounded bg-muted px-1 py-0.5 text-xs">
																				{record.field}
																			</code>
																		</TableCell>
																		<TableCell className="text-sm font-mono">
																			{record.sourceValue}
																		</TableCell>
																		<TableCell className="text-sm font-mono">
																			{record.targetValue ?? "—"}
																		</TableCell>
																		<TableCell className="hidden max-w-xs truncate md:table-cell text-sm text-muted-foreground">
																			{record.discrepancy}
																		</TableCell>
																	</TableRow>
																))}
															</TableBody>
														</Table>
													</div>
												</TableCell>
											</TableRow>
										)}
									</Fragment>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}

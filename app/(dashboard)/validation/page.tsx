"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
	CheckCircle,
	XCircle,
	AlertTriangle,
	Shield,
	FileCheck,
	Clock,
	Search,
	ToggleLeft,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
	ValidationSummary,
	ValidationRule,
	ValidationResult,
	ValidationError,
} from "@/lib/ingestion-validation";

type ValidationData = {
	summary: ValidationSummary;
	rules: ValidationRule[];
};

function StatusBadge({ status }: { status: ValidationResult["status"] }) {
	const config = {
		passed: { label: "Passed", variant: "outline" as const, className: "border-green-500 text-green-600 dark:text-green-400" },
		failed: { label: "Failed", variant: "destructive" as const, className: "" },
		warnings: { label: "Warnings", variant: "secondary" as const, className: "border-yellow-500 text-yellow-600 dark:text-yellow-400" },
	};
	const c = config[status];
	return <Badge variant={c.variant} className={c.className}>{c.label}</Badge>;
}

function SeverityBadge({ severity }: { severity: ValidationError["severity"] }) {
	const config = {
		error: { variant: "destructive" as const, className: "" },
		warning: { variant: "secondary" as const, className: "" },
		info: { variant: "outline" as const, className: "" },
	};
	const c = config[severity];
	return <Badge variant={c.variant} className={c.className}>{severity}</Badge>;
}

export default function ValidationPage() {
	const [search, setSearch] = useState("");
	const [selectedResult, setSelectedResult] = useState<string | null>(null);

	const { data, isLoading } = useQuery<ValidationData>({
		queryKey: ["validation"],
		queryFn: () => fetch("/api/validation").then((r) => r.json()),
	});

	if (isLoading || !data) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-bold">Ingestion Validation</h1>
					<p className="text-muted-foreground">
						Intelligent validation rules for ingested data
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

	const { summary, rules } = data;
	const filteredResults = summary.recentResults.filter((r) =>
		r.fileName.toLowerCase().includes(search.toLowerCase()) ||
		r.tenantName.toLowerCase().includes(search.toLowerCase()),
	);
	const selectedResultData = summary.recentResults.find((r) => r.id === selectedResult);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Ingestion Validation</h1>
				<p className="text-muted-foreground">
					Intelligent validation rules for ingested data
				</p>
			</div>

			{/* Summary cards */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">Total Validations</p>
								<p className="text-2xl font-bold">{summary.totalValidations}</p>
							</div>
							<div className="rounded-lg bg-muted p-2.5">
								<FileCheck className="h-5 w-5 text-muted-foreground" />
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">Passed</p>
								<p className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.passed}</p>
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
								<p className="text-xs font-medium text-muted-foreground">Failed</p>
								<p className="text-2xl font-bold text-destructive">{summary.failed}</p>
							</div>
							<div className="rounded-lg bg-destructive/10 p-2.5">
								<XCircle className="h-5 w-5 text-destructive" />
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">Avg Validation Time</p>
								<p className="text-2xl font-bold">{(summary.avgValidationTimeMs / 1000).toFixed(1)}s</p>
							</div>
							<div className="rounded-lg bg-muted p-2.5">
								<Clock className="h-5 w-5 text-muted-foreground" />
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Common errors */}
			{summary.commonErrors.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
							Most Common Validation Issues
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap gap-3">
							{summary.commonErrors.map((error) => (
								<div
									key={error.rule}
									className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
								>
									<span className="text-sm font-medium">{error.rule}</span>
									<Badge variant="secondary">{error.count} occurrences</Badge>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Main content tabs */}
			<Tabs defaultValue="results">
				<TabsList>
					<TabsTrigger value="results">Validation Results</TabsTrigger>
					<TabsTrigger value="rules">Validation Rules ({rules.length})</TabsTrigger>
				</TabsList>

				<TabsContent value="results">
					<Card className="mt-4">
						<CardHeader>
							<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<CardTitle>Recent Validations</CardTitle>
								<div className="relative w-full sm:w-72">
									<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
									<Input
										placeholder="Search by file or tenant..."
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
										<TableHead>File</TableHead>
										<TableHead>Tenant</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="hidden md:table-cell">Records</TableHead>
										<TableHead className="hidden md:table-cell">Errors</TableHead>
										<TableHead className="hidden lg:table-cell">Duration</TableHead>
										<TableHead>Details</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredResults.length === 0 ? (
										<TableRow>
											<TableCell colSpan={7} className="text-center text-muted-foreground">
												No validation results found.
											</TableCell>
										</TableRow>
									) : (
										filteredResults.map((result) => (
											<TableRow key={result.id}>
												<TableCell className="font-medium">{result.fileName}</TableCell>
												<TableCell>{result.tenantName}</TableCell>
												<TableCell>
													<StatusBadge status={result.status} />
												</TableCell>
												<TableCell className="hidden md:table-cell">
													<span className="text-green-600 dark:text-green-400">{result.validRecords}</span>
													{result.invalidRecords > 0 && (
														<span className="text-destructive"> / {result.invalidRecords} invalid</span>
													)}
												</TableCell>
												<TableCell className="hidden md:table-cell">
													{result.errors.length > 0 ? (
														<Badge variant="secondary">{result.errors.length}</Badge>
													) : (
														<span className="text-muted-foreground">—</span>
													)}
												</TableCell>
												<TableCell className="hidden lg:table-cell text-muted-foreground">
													{(result.duration / 1000).toFixed(1)}s
												</TableCell>
												<TableCell>
													<Button
														variant="outline"
														size="sm"
														onClick={() =>
															setSelectedResult(
																selectedResult === result.id ? null : result.id,
															)
														}
													>
														{selectedResult === result.id ? "Hide" : "View"}
													</Button>
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>

							{/* Expanded error details */}
							{selectedResultData && selectedResultData.errors.length > 0 && (
								<div className="mt-4 rounded-lg border border-border bg-muted/50 p-4">
									<h4 className="mb-3 font-semibold">
										Validation Errors for {selectedResultData.fileName}
									</h4>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Severity</TableHead>
												<TableHead>Rule</TableHead>
												<TableHead>Field</TableHead>
												<TableHead className="hidden md:table-cell">Row</TableHead>
												<TableHead>Message</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{selectedResultData.errors.map((error, idx) => (
												<TableRow key={idx}>
													<TableCell>
														<SeverityBadge severity={error.severity} />
													</TableCell>
													<TableCell className="font-medium">{error.ruleName}</TableCell>
													<TableCell>
														<code className="rounded bg-muted px-1 py-0.5 text-xs">
															{error.field}
														</code>
													</TableCell>
													<TableCell className="hidden md:table-cell">
														{error.row ?? "—"}
													</TableCell>
													<TableCell className="text-sm text-muted-foreground">
														{error.message}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="rules">
					<Card className="mt-4">
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="flex items-center gap-2">
									<Shield className="h-5 w-5" />
									Validation Rules
								</CardTitle>
							</div>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Status</TableHead>
										<TableHead>Rule</TableHead>
										<TableHead>Type</TableHead>
										<TableHead className="hidden md:table-cell">Field</TableHead>
										<TableHead>Severity</TableHead>
										<TableHead className="hidden lg:table-cell">Description</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{rules.map((rule) => (
										<TableRow key={rule.id}>
											<TableCell>
												<div className="flex items-center gap-1.5">
													<ToggleLeft
														className={`h-4 w-4 ${
															rule.enabled
																? "text-green-600 dark:text-green-400"
																: "text-muted-foreground"
														}`}
													/>
													<span className="text-xs">
														{rule.enabled ? "Active" : "Disabled"}
													</span>
												</div>
											</TableCell>
											<TableCell className="font-medium">{rule.name}</TableCell>
											<TableCell>
												<Badge variant="outline">{rule.type}</Badge>
											</TableCell>
											<TableCell className="hidden md:table-cell">
												<code className="rounded bg-muted px-1 py-0.5 text-xs">
													{rule.field}
												</code>
											</TableCell>
											<TableCell>
												<SeverityBadge severity={rule.severity} />
											</TableCell>
											<TableCell className="hidden max-w-xs truncate lg:table-cell text-sm text-muted-foreground">
												{rule.description}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}

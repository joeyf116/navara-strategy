"use client";

import { useQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	AlertOctagon,
	CheckCircle,
	Info,
	ShieldAlert,
	Activity,
	Inbox,
	Cpu,
	Server,
	Eye,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { Anomaly, AnomalySeverity } from "@/lib/anomaly-detection";

type AnomalyData = {
	anomalies: Anomaly[];
	summary: {
		total: number;
		active: number;
		critical: number;
		warnings: number;
		resolved: number;
	};
};

const severityConfig: Record<
	AnomalySeverity,
	{ color: string; icon: React.ElementType; badgeVariant: "destructive" | "secondary" | "outline" }
> = {
	critical: { color: "text-destructive", icon: AlertOctagon, badgeVariant: "destructive" },
	warning: { color: "text-yellow-600 dark:text-yellow-400", icon: AlertTriangle, badgeVariant: "secondary" },
	info: { color: "text-blue-600 dark:text-blue-400", icon: Info, badgeVariant: "outline" },
};

const categoryConfig: Record<string, { icon: React.ElementType; label: string }> = {
	ingestion: { icon: Activity, label: "Ingestion" },
	queue: { icon: Inbox, label: "Queue" },
	performance: { icon: Cpu, label: "Performance" },
	resource: { icon: Server, label: "Resource" },
	security: { icon: ShieldAlert, label: "Security" },
};

function SummaryCard({
	title,
	value,
	icon: Icon,
	variant,
}: {
	title: string;
	value: number;
	icon: React.ElementType;
	variant?: "destructive" | "warning" | "success";
}) {
	return (
		<Card>
			<CardContent className="p-4">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">{title}</p>
						<p className="text-2xl font-bold">{value}</p>
					</div>
					<div
						className={`rounded-lg p-2.5 ${
							variant === "destructive"
								? "bg-destructive/10"
								: variant === "warning"
									? "bg-yellow-500/10"
									: variant === "success"
										? "bg-green-500/10"
										: "bg-muted"
						}`}
					>
						<Icon
							className={`h-5 w-5 ${
								variant === "destructive"
									? "text-destructive"
									: variant === "warning"
										? "text-yellow-600 dark:text-yellow-400"
										: variant === "success"
											? "text-green-600 dark:text-green-400"
											: "text-muted-foreground"
							}`}
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export default function AnomalyDetectionPage() {
	const { data, isLoading } = useQuery<AnomalyData>({
		queryKey: ["anomalies"],
		queryFn: () => fetch("/api/anomalies").then((r) => r.json()),
	});

	if (isLoading || !data) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-bold">Anomaly Detection</h1>
					<p className="text-muted-foreground">
						AI-powered anomaly detection across ingestion metrics
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

	const { anomalies, summary } = data;
	const activeAnomalies = anomalies.filter((a) => a.status === "active");
	const acknowledgedAnomalies = anomalies.filter((a) => a.status === "acknowledged");
	const resolvedAnomalies = anomalies.filter((a) => a.status === "resolved");

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Anomaly Detection</h1>
				<p className="text-muted-foreground">
					AI-powered anomaly detection across ingestion metrics
				</p>
			</div>

			{/* Summary cards */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<SummaryCard
					title="Total Anomalies"
					value={summary.total}
					icon={Eye}
				/>
				<SummaryCard
					title="Critical"
					value={summary.critical}
					icon={AlertOctagon}
					variant="destructive"
				/>
				<SummaryCard
					title="Warnings"
					value={summary.warnings}
					icon={AlertTriangle}
					variant="warning"
				/>
				<SummaryCard
					title="Resolved"
					value={summary.resolved}
					icon={CheckCircle}
					variant="success"
				/>
			</div>

			{/* Anomaly tabs */}
			<Tabs defaultValue="active">
				<TabsList>
					<TabsTrigger value="active">
						Active ({activeAnomalies.length})
					</TabsTrigger>
					<TabsTrigger value="acknowledged">
						Acknowledged ({acknowledgedAnomalies.length})
					</TabsTrigger>
					<TabsTrigger value="resolved">
						Resolved ({resolvedAnomalies.length})
					</TabsTrigger>
				</TabsList>

				<TabsContent value="active">
					<AnomalyTable anomalies={activeAnomalies} showActions />
				</TabsContent>
				<TabsContent value="acknowledged">
					<AnomalyTable anomalies={acknowledgedAnomalies} />
				</TabsContent>
				<TabsContent value="resolved">
					<AnomalyTable anomalies={resolvedAnomalies} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function AnomalyTable({
	anomalies,
	showActions,
}: {
	anomalies: Anomaly[];
	showActions?: boolean;
}) {
	if (anomalies.length === 0) {
		return (
			<Card className="mt-4">
				<CardContent className="py-10 text-center text-muted-foreground">
					No anomalies in this category.
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="mt-4">
			<CardHeader>
				<CardTitle>Detected Anomalies</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Severity</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Title</TableHead>
							<TableHead className="hidden md:table-cell">Description</TableHead>
							<TableHead>Confidence</TableHead>
							<TableHead className="hidden lg:table-cell">Detected</TableHead>
							{showActions && <TableHead>Action</TableHead>}
						</TableRow>
					</TableHeader>
					<TableBody>
						{anomalies.map((anomaly) => {
							const severity = severityConfig[anomaly.severity];
							const category = categoryConfig[anomaly.category];
							const SeverityIcon = severity.icon;
							const CategoryIcon = category?.icon ?? Activity;

							return (
								<TableRow key={anomaly.id}>
									<TableCell>
										<div className="flex items-center gap-1.5">
											<SeverityIcon className={`h-4 w-4 ${severity.color}`} />
											<Badge variant={severity.badgeVariant}>
												{anomaly.severity}
											</Badge>
										</div>
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-1.5">
											<CategoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
											<span className="text-sm">{category?.label ?? anomaly.category}</span>
										</div>
									</TableCell>
									<TableCell className="font-medium">{anomaly.title}</TableCell>
									<TableCell className="hidden max-w-xs truncate md:table-cell text-muted-foreground text-sm">
										{anomaly.description}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-1">
											<div className="h-2 w-16 rounded-full bg-muted">
												<div
													className={`h-2 rounded-full ${
														anomaly.confidence > 90
															? "bg-green-500"
															: anomaly.confidence > 70
																? "bg-yellow-500"
																: "bg-orange-500"
													}`}
													style={{ width: `${anomaly.confidence}%` }}
												/>
											</div>
											<span className="text-xs text-muted-foreground">
												{anomaly.confidence}%
											</span>
										</div>
									</TableCell>
									<TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
										{new Date(anomaly.detectedAt).toLocaleString()}
									</TableCell>
									{showActions && (
										<TableCell>
											<Button variant="outline" size="sm">
												Acknowledge
											</Button>
										</TableCell>
									)}
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

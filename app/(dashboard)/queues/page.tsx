"use client";

import { useQuery } from "@tanstack/react-query";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import { AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { QueueMetrics } from "@/lib/types";

function formatAge(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
	return `${(seconds / 3600).toFixed(1)}h`;
}

export default function QueuesPage() {
	const { data, isLoading } = useQuery<{ queues: QueueMetrics[] }>({
		queryKey: ["queues"],
		queryFn: () => fetch("/api/queues").then((r) => r.json()),
	});

	const queues = data?.queues ?? [];
	const chartData = queues.map((q) => ({
		name: q.name.replace("navara-", ""),
		visible: q.messagesVisible,
		inFlight: q.messagesInFlight,
		delayed: q.messagesDelayed,
	}));

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Queue Monitoring</h1>
				<p className="text-muted-foreground">
					SQS queue depths, throughput, and message metrics
				</p>
			</div>

			{isLoading ? (
				<div className="grid gap-4 sm:grid-cols-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton key={i} className="h-48" />
					))}
				</div>
			) : (
				<>
					<div className="grid gap-4 sm:grid-cols-2">
						{queues.map((queue) => (
							<Card key={queue.name}>
								<CardHeader className="pb-2">
									<div className="flex items-center justify-between">
										<CardTitle className="text-base">{queue.name}</CardTitle>
										{queue.dlqCount > 0 && (
											<Badge variant="destructive" className="gap-1">
												<AlertTriangle className="h-3 w-3" />
												DLQ: {queue.dlqCount}
											</Badge>
										)}
									</div>
								</CardHeader>
								<CardContent>
									<div className="grid grid-cols-3 gap-4 text-center">
										<div>
											<p className="text-2xl font-bold">
												{queue.messagesVisible}
											</p>
											<p className="text-xs text-muted-foreground">Visible</p>
										</div>
										<div>
											<p className="text-2xl font-bold">
												{queue.messagesInFlight}
											</p>
											<p className="text-xs text-muted-foreground">In Flight</p>
										</div>
										<div>
											<p className="text-2xl font-bold">
												{queue.throughputPerMinute}
											</p>
											<p className="text-xs text-muted-foreground">msgs/min</p>
										</div>
									</div>
									<div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
										<span>
											Oldest: {formatAge(queue.oldestMessageAgeSeconds)}
										</span>
										<span>Delayed: {queue.messagesDelayed}</span>
									</div>
								</CardContent>
							</Card>
						))}
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Queue Depth Overview</CardTitle>
						</CardHeader>
						<CardContent>
							<ResponsiveContainer width="100%" height={300}>
								<BarChart data={chartData}>
									<CartesianGrid
										strokeDasharray="3 3"
										className="stroke-border"
									/>
									<XAxis dataKey="name" className="text-xs" />
									<YAxis className="text-xs" />
									<Tooltip
										contentStyle={{
											backgroundColor: "var(--card)",
											border: "1px solid var(--border)",
											borderRadius: "0.375rem",
											color: "var(--card-foreground)",
										}}
									/>
									<Bar
										dataKey="visible"
										fill="var(--chart-1)"
										name="Visible"
										radius={[4, 4, 0, 0]}
									/>
									<Bar
										dataKey="inFlight"
										fill="var(--chart-3)"
										name="In Flight"
										radius={[4, 4, 0, 0]}
									/>
									<Bar
										dataKey="delayed"
										fill="var(--chart-4)"
										name="Delayed"
										radius={[4, 4, 0, 0]}
									/>
								</BarChart>
							</ResponsiveContainer>
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}

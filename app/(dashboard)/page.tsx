"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Inbox,
  Clock,
  Users,
  Database,
  Link2,
  HardDrive,
  Zap,
  Heart,
  AlertOctagon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardMetrics, ChartDataPoint } from "@/lib/types";

type DashboardData = {
  metrics: DashboardMetrics;
  ingestionChart: ChartDataPoint[];
  throughputChart: ChartDataPoint[];
};

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p
                className={`text-xs ${
                  trend === "down"
                    ? "text-destructive"
                    : trend === "up"
                      ? "text-success"
                      : "text-muted-foreground"
                }`}
              >
                {subtitle}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-muted p-2.5">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/dashboard").then((r) => r.json()),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Operational overview and platform health
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <MetricSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const { metrics, ingestionChart, throughputChart } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Operational overview and platform health
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <MetricCard
          title="Total Files"
          value={metrics.totalFiles.toLocaleString()}
          subtitle="All time uploads"
          icon={FileText}
        />
        <MetricCard
          title="Processed Today"
          value={metrics.filesProcessedToday}
          subtitle="+12% from yesterday"
          icon={CheckCircle}
          trend="up"
        />
        <MetricCard
          title="Failed Ingestions"
          value={metrics.failedIngestions}
          subtitle="Requires attention"
          icon={AlertTriangle}
          trend="down"
        />
        <MetricCard
          title="Queue Depth"
          value={metrics.queueDepth}
          subtitle="Messages pending"
          icon={Inbox}
        />
        <MetricCard
          title="Avg Ingestion Time"
          value={`${(metrics.avgIngestionTimeMs / 1000).toFixed(1)}s`}
          subtitle="Per file average"
          icon={Clock}
        />
        <MetricCard
          title="Active Tenants"
          value={metrics.activeTenants}
          subtitle="Currently active"
          icon={Users}
          trend="up"
        />
        <MetricCard
          title="Aurora Connections"
          value={metrics.auroraConnections}
          subtitle="Active DB connections"
          icon={Database}
        />
        <MetricCard
          title="SFTP Connections"
          value={metrics.sftpConnectionsToday}
          subtitle="Today's sessions"
          icon={Link2}
        />
        <MetricCard
          title="Storage Used"
          value={`${metrics.storageUsedGB} GB`}
          subtitle="S3 bucket usage"
          icon={HardDrive}
        />
        <MetricCard
          title="Throughput"
          value={`${metrics.processingThroughputPerMin}/min`}
          subtitle="Files processed"
          icon={Zap}
          trend="up"
        />
        <MetricCard
          title="Worker Health"
          value={`${metrics.healthyWorkers}/${metrics.totalWorkers}`}
          subtitle="Healthy workers"
          icon={Heart}
          trend={
            metrics.healthyWorkers === metrics.totalWorkers ? "up" : "down"
          }
        />
        <MetricCard
          title="DLQ Count"
          value={metrics.dlqCount}
          subtitle="Dead letter queue"
          icon={AlertOctagon}
          trend={metrics.dlqCount > 0 ? "down" : "up"}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingestion Activity (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ingestionChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
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
                  <Area
                    type="monotone"
                    dataKey="ingested"
                    stroke="var(--chart-1)"
                    fill="var(--chart-1)"
                    fillOpacity={0.2}
                    name="Ingested"
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    stroke="var(--chart-5)"
                    fill="var(--chart-5)"
                    fillOpacity={0.2}
                    name="Failed"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Throughput</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={throughputChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
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
                    dataKey="throughput"
                    fill="var(--chart-2)"
                    radius={[4, 4, 0, 0]}
                    name="Files Processed"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

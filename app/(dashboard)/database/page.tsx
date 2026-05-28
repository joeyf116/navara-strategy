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
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { DatabaseMetrics } from "@/lib/types";

function ProgressBar({
  value,
  max,
  label,
  color = "bg-chart-1",
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  const percent = Math.round((value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {value}/{max} ({percent}%)
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function DatabasePage() {
  const { data, isLoading } = useQuery<{ metrics: DatabaseMetrics }>({
    queryKey: ["database"],
    queryFn: () => fetch("/api/database").then((r) => r.json()),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Database Insights</h1>
          <p className="text-muted-foreground">
            Aurora PostgreSQL performance and health metrics
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      </div>
    );
  }

  const { metrics } = data;

  const iopsData = [
    { name: "Read", value: metrics.iopsRead },
    { name: "Write", value: metrics.iopsWrite },
  ];

  const acuData = [
    { name: "Used", value: metrics.acuCurrent },
    { name: "Available", value: metrics.acuMax - metrics.acuCurrent },
  ];

  const pieColors = ["var(--chart-1)", "var(--muted)"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Database Insights</h1>
        <p className="text-muted-foreground">
          Aurora PostgreSQL performance and health metrics
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active Queries</p>
            <p className="text-2xl font-bold">{metrics.activeQueries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Slow Queries</p>
            <p className="text-2xl font-bold text-warning">
              {metrics.slowQueries}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Query Time</p>
            <p className="text-2xl font-bold">{metrics.avgQueryTimeMs}ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Replication Lag</p>
            <p className="text-2xl font-bold text-success">
              {metrics.replicationLagMs}ms
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Connection Pool</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar
              value={metrics.connectionPoolUsed}
              max={metrics.connectionPoolMax}
              label="Connections"
              color="bg-chart-1"
            />
            <ProgressBar
              value={Math.round(metrics.cpuPercent)}
              max={100}
              label="CPU Usage"
              color="bg-chart-3"
            />
            <ProgressBar
              value={Math.round(metrics.memoryPercent)}
              max={100}
              label="Memory Usage"
              color="bg-chart-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>ACU Scaling</CardTitle>
              <Badge variant="outline">
                {metrics.acuMin} - {metrics.acuMax} ACU range
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <div className="h-[180px] w-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={acuData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {acuData.map((_, index) => (
                        <Cell key={index} fill={pieColors[index]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.375rem",
                        color: "var(--card-foreground)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 text-sm">
                <p>
                  Current:{" "}
                  <span className="font-bold">{metrics.acuCurrent} ACU</span>
                </p>
                <p className="text-muted-foreground">
                  Tables: {metrics.tableCount}
                </p>
                <p className="text-muted-foreground">
                  Size: {metrics.totalSizeGB} GB
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>IOPS</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={iopsData}>
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
                  dataKey="value"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                  name="IOPS"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Loader2 } from "lucide-react";

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
import type { IngestionJob } from "@/lib/types";

const statusConfig: Record<
  IngestionJob["status"],
  { variant: "success" | "warning" | "destructive" | "outline" | "secondary"; label: string }
> = {
  queued: { variant: "outline", label: "Queued" },
  processing: { variant: "warning", label: "Processing" },
  completed: { variant: "success", label: "Completed" },
  failed: { variant: "destructive", label: "Failed" },
  retrying: { variant: "secondary", label: "Retrying" },
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

export default function IngestionPage() {
  const { data, isLoading, refetch, isFetching } = useQuery<{
    jobs: IngestionJob[];
  }>({
    queryKey: ["ingestion"],
    queryFn: () => fetch("/api/ingestion").then((r) => r.json()),
  });

  const jobs = data?.jobs ?? [];
  const processing = jobs.filter((j) => j.status === "processing").length;
  const queued = jobs.filter((j) => j.status === "queued").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ingestion Jobs</h1>
          <p className="text-muted-foreground">
            Monitor file processing pipeline and job status
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Jobs</p>
            <p className="text-2xl font-bold">{jobs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Processing</p>
            <p className="text-2xl font-bold text-warning">{processing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Queued</p>
            <p className="text-2xl font-bold">{queued}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-2xl font-bold text-destructive">{failed}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
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
                  <TableHead>Status</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Retries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const config = statusConfig[job.status];
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">
                        {job.fileName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {job.tenantName}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant}>{config.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {job.recordsProcessed.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {job.recordsFailed > 0 ? (
                          <span className="text-destructive">
                            {job.recordsFailed}
                          </span>
                        ) : (
                          "0"
                        )}
                      </TableCell>
                      <TableCell>{formatDuration(job.durationMs)}</TableCell>
                      <TableCell>{formatSize(job.fileSize)}</TableCell>
                      <TableCell>
                        {job.retryCount > 0 ? (
                          <Badge variant="secondary">{job.retryCount}</Badge>
                        ) : (
                          "0"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

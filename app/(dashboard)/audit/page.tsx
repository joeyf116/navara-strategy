"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, Download } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { AuditLogEntry } from "@/lib/types";

const actionColors: Record<string, "default" | "destructive" | "warning" | "success" | "secondary" | "outline"> = {
  REPROCESS_FILE: "warning",
  UPDATE_TENANT: "secondary",
  UPLOAD_FILE: "success",
  PURGE_DLQ: "destructive",
  CREATE_TENANT: "success",
  EXPORT_LOGS: "outline",
  UPDATE_CONFIG: "warning",
  VIEW_FILES: "outline",
};

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery<{ logs: AuditLogEntry[] }>({
    queryKey: ["audit"],
    queryFn: () => fetch("/api/audit").then((r) => r.json()),
  });

  const filtered =
    data?.logs.filter(
      (log) =>
        log.userName.toLowerCase().includes(search.toLowerCase()) ||
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.details.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">
            Track all user actions and system events
          </p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Activity Log</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
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
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium">
                      {log.userName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionColors[log.action] ?? "outline"}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.resource}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {log.details}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {log.ipAddress}
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

"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, MoreHorizontal } from "lucide-react";
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
import type { Tenant } from "@/lib/types";

const statusVariant = {
  active: "success" as const,
  inactive: "secondary" as const,
  suspended: "destructive" as const,
};

const planLabel = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

export default function TenantsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery<{ tenants: Tenant[] }>({
    queryKey: ["tenants"],
    queryFn: () => fetch("/api/tenants").then((r) => r.json()),
  });

  const filtered =
    data?.tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.contactEmail.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tenant Management</h1>
        <p className="text-muted-foreground">
          Manage and monitor all tenants on the platform
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Tenants</p>
            <p className="text-2xl font-bold">{data?.tenants.length ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-success">
              {data?.tenants.filter((t) => t.status === "active").length ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Files</p>
            <p className="text-2xl font-bold">
              {data?.tenants
                .reduce((sum, t) => sum + t.filesUploaded, 0)
                .toLocaleString() ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Tenants</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenants..."
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
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">
                      {tenant.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[tenant.status]}>
                        {tenant.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{planLabel[tenant.plan]}</Badge>
                    </TableCell>
                    <TableCell>
                      {tenant.filesUploaded.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenant.contactEmail}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(tenant.lastActivity).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
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

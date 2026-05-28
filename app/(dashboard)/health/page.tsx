"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle, AlertTriangle, XCircle, HelpCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { ServiceHealth, ServiceStatus } from "@/lib/types";

const statusIcon: Record<ServiceStatus, React.ElementType> = {
  healthy: CheckCircle,
  degraded: AlertTriangle,
  unhealthy: XCircle,
  unknown: HelpCircle,
};

const statusVariant: Record<ServiceStatus, "success" | "warning" | "destructive" | "outline"> = {
  healthy: "success",
  degraded: "warning",
  unhealthy: "destructive",
  unknown: "outline",
};

const statusColor: Record<ServiceStatus, string> = {
  healthy: "text-success",
  degraded: "text-warning",
  unhealthy: "text-destructive",
  unknown: "text-muted-foreground",
};

function ServiceCard({ service }: { service: ServiceHealth }) {
  const Icon = statusIcon[service.status];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${statusColor[service.status]}`} />
              <h3 className="font-medium">{service.name}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{service.details}</p>
          </div>
          <Badge variant={statusVariant[service.status]}>
            {service.status}
          </Badge>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span>Latency: {service.latencyMs}ms</span>
          <span>
            Checked: {new Date(service.lastChecked).toLocaleTimeString()}
          </span>
        </div>
        {service.metrics && (
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(service.metrics).map(([key, value]) => (
              <Badge key={key} variant="outline" className="text-xs">
                {key}: {value}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function HealthPage() {
  const { data, isLoading } = useQuery<{ services: ServiceHealth[] }>({
    queryKey: ["health"],
    queryFn: () => fetch("/api/health").then((r) => r.json()),
  });

  const services = data?.services ?? [];
  const byCategory = {
    aws: services.filter((s) => s.category === "aws"),
    database: services.filter((s) => s.category === "database"),
    pipeline: services.filter((s) => s.category === "pipeline"),
    application: services.filter((s) => s.category === "application"),
  };

  const healthyCount = services.filter((s) => s.status === "healthy").length;
  const degradedCount = services.filter((s) => s.status === "degraded").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Service Health</h1>
        <p className="text-muted-foreground">
          Infrastructure and pipeline health monitoring
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Healthy Services</p>
            <p className="text-2xl font-bold text-success">
              {healthyCount}/{services.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Degraded</p>
            <p className="text-2xl font-bold text-warning">{degradedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Overall Status</p>
            <p className="text-2xl font-bold">
              {degradedCount > 0 ? (
                <span className="text-warning">Degraded</span>
              ) : (
                <span className="text-success">Healthy</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="aws">
          <TabsList>
            <TabsTrigger value="aws">
              AWS ({byCategory.aws.length})
            </TabsTrigger>
            <TabsTrigger value="database">
              Database ({byCategory.database.length})
            </TabsTrigger>
            <TabsTrigger value="pipeline">
              Pipeline ({byCategory.pipeline.length})
            </TabsTrigger>
            <TabsTrigger value="application">
              Application ({byCategory.application.length})
            </TabsTrigger>
          </TabsList>

          {Object.entries(byCategory).map(([category, items]) => (
            <TabsContent key={category} value={category}>
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((service) => (
                  <ServiceCard key={service.name} service={service} />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

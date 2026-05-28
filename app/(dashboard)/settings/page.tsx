"use client";

import { Moon, Sun, Monitor } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Platform configuration and preferences
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Customize the look and feel of the portal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                onClick={() => setTheme("light")}
                className="flex-1"
              >
                <Sun className="h-4 w-4" />
                Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                onClick={() => setTheme("dark")}
                className="flex-1"
              >
                <Moon className="h-4 w-4" />
                Dark
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                onClick={() => setTheme("system")}
                className="flex-1"
              >
                <Monitor className="h-4 w-4" />
                System
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Configure alert and notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="email-alerts">Email Alerts</Label>
              <Switch id="email-alerts" defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="failed-alerts">Failed Ingestion Alerts</Label>
              <Switch id="failed-alerts" defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="dlq-alerts">DLQ Alerts</Label>
              <Switch id="dlq-alerts" defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="health-alerts">Health Degradation Alerts</Label>
              <Switch id="health-alerts" defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Refresh</CardTitle>
            <CardDescription>
              Configure how often dashboard data is refreshed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Auto-refresh interval</Label>
              <Badge variant="outline">30 seconds</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-refresh">Auto-refresh enabled</Label>
              <Switch id="auto-refresh" defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Data source</Label>
              <Badge variant="secondary">Mock Data (Demo)</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform Info</CardTitle>
            <CardDescription>System and deployment details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Version</span>
              <Badge variant="outline">0.1.0</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Environment</span>
              <Badge variant="secondary">Development</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Next.js</span>
              <Badge variant="outline">16.x</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Auth Provider</span>
              <Badge variant="outline">NextAuth (Demo)</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Region</span>
              <Badge variant="outline">us-east-1</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

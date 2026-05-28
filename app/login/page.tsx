"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid credentials. Try demo accounts below.");
    } else {
      window.location.href = "/";
    }
    setIsLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <span className="text-lg font-bold text-primary-foreground">N</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold">Navara Insights Portal</h1>
          <p className="text-muted-foreground">
            Sign in to access the operational dashboard
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="superadmin@navara.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="demo"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demo Accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-mono">superadmin@navara.io</span>
              <Badge variant="outline">Super Admin</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono">admin@navara.io</span>
              <Badge variant="outline">Admin</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono">tenant@acme.com</span>
              <Badge variant="outline">Tenant User</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono">auditor@navara.io</span>
              <Badge variant="outline">Auditor</Badge>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Password for all accounts: <code className="font-bold">demo</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

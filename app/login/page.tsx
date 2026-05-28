"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";

const DEV_ACCOUNTS = [
  { email: "superadmin@navara.io", label: "Super Admin" },
  { email: "admin@navara.io", label: "Admin" },
  { email: "tenant@acme.com", label: "Tenant User" },
  { email: "auditor@navara.io", label: "Auditor" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(isDevMode);

  async function handleOAuthSignIn() {
    setIsLoading(true);
    setError("");
    await signIn("microsoft-entra-id", { callbackUrl: "/" });
  }

  async function handleDevSignIn(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await signIn("dev-credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid credentials. Try one of the demo accounts below.");
    } else {
      window.location.href = "/";
    }
    setIsLoading(false);
  }

  function handleQuickLogin(accountEmail: string) {
    setEmail(accountEmail);
    setPassword("demo");
    // Auto-submit after a tick so state updates
    setTimeout(async () => {
      setIsLoading(true);
      setError("");
      const result = await signIn("dev-credentials", {
        email: accountEmail,
        password: "demo",
        redirect: false,
      });
      if (result?.error) {
        setError("Login failed.");
      } else {
        window.location.href = "/";
      }
      setIsLoading(false);
    }, 0);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <span className="text-lg font-bold text-primary-foreground">
              N
            </span>
          </div>
          <h1 className="mt-4 text-2xl font-bold">Navara Insights Portal</h1>
          <p className="text-muted-foreground">
            Sign in to access the operational dashboard
          </p>
        </div>

        {/* Production Login */}
        {!showDevLogin && (
          <Card>
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>
                Sign in with your organization account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                className="w-full"
                onClick={handleOAuthSignIn}
                disabled={isLoading}
              >
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 21 21"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                {isLoading
                  ? "Redirecting..."
                  : "Sign in with Microsoft"}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        )}

        {/* Dev Mode Login */}
        {showDevLogin && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Dev Login
                  <Badge
                    variant="outline"
                    className="border-amber-500 text-amber-500"
                  >
                    DEV MODE
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Sign in with a demo account to test RBAC roles locally
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleDevSignIn} className="space-y-4">
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
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Quick-select role cards */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Role Select</CardTitle>
                <CardDescription className="text-xs">
                  Click a role to sign in instantly
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {DEV_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    onClick={() => handleQuickLogin(account.email)}
                    disabled={isLoading}
                    className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <span className="font-mono text-xs">{account.email}</span>
                    <Badge variant="outline">{account.label}</Badge>
                  </button>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        {/* Dev mode toggle */}
        {isDevMode && (
          <div className="text-center">
            <button
              onClick={() => setShowDevLogin(!showDevLogin)}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {showDevLogin
                ? "Switch to production login"
                : "Switch to dev mode login"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

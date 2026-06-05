"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Alert, AlertDescription } from "@/components/ui/alert";

const DEV_ACCOUNTS = [
	{ email: "superadmin@navara.io", label: "Super Admin" },
	{ email: "admin@navara.io", label: "Admin" },
	{ email: "tenant@acme.com", label: "Tenant User" },
	{ email: "auditor@navara.io", label: "Auditor" },
];

interface LoginFormProps {
	isDev: boolean;
	hasCognito: boolean;
	callbackUrl?: string;
	authError?: string;
}

function getAuthErrorMessage(error?: string): string {
	if (!error) return "";

	switch (error) {
		case "AccessDenied":
			return "Access denied by the identity provider. Verify the user exists, is enabled/confirmed, and has a permanent password in Cognito.";
		case "Configuration":
			return "Authentication is misconfigured. Check AUTH_COGNITO_ID, AUTH_COGNITO_SECRET, and AUTH_COGNITO_ISSUER.";
		case "Verification":
			return "Unable to verify the authentication response. Check callback URL and issuer settings.";
		default:
			return `Authentication failed (${error}).`;
	}
}

export function LoginForm({
	isDev,
	hasCognito,
	callbackUrl = "/uploads",
	authError,
}: LoginFormProps) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(getAuthErrorMessage(authError));
	const [isLoading, setIsLoading] = useState(false);
	const [showDevLogin, setShowDevLogin] = useState(isDev && !hasCognito);
	const router = useRouter();

	async function handleCognitoSignIn() {
		setIsLoading(true);
		setError("");
		try {
			await signIn("cognito", { callbackUrl, redirect: true });
		} catch {
			setError("AWS sign in failed. Please try again.");
			setIsLoading(false);
		}
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
			router.push(callbackUrl);
		}
		setIsLoading(false);
	}

	async function handleQuickLogin(accountEmail: string) {
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
			router.push(callbackUrl);
		}
		setIsLoading(false);
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4">
			<div className="w-full max-w-md space-y-6">
				<div className="text-center">
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
						<span className="text-lg font-bold text-primary-foreground">N</span>
					</div>
					<h1 className="mt-4 text-2xl font-semibold tracking-tight">
						Navara File Portal
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Sign in to access the secure file sharing portal.
					</p>
				</div>

				{error ? (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}

				{!showDevLogin && hasCognito && (
					<Card>
						<CardHeader>
							<CardTitle>Sign in</CardTitle>
							<CardDescription>
								Sign in with your organization account.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button
								className="w-full"
								onClick={handleCognitoSignIn}
								disabled={isLoading}
							>
								{isLoading ? "Redirecting to AWS..." : "Sign in with AWS"}
							</Button>
						</CardContent>
					</Card>
				)}

				{showDevLogin && isDev && (
					<>
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									Dev login
									<Badge
										variant="outline"
										className="border-amber-500 text-amber-500"
									>
										DEV MODE
									</Badge>
								</CardTitle>
								<CardDescription>
									Sign in with a demo account to test RBAC roles locally.
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
									<Button type="submit" className="w-full" disabled={isLoading}>
										{isLoading ? "Signing in..." : "Sign in"}
									</Button>
								</form>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">Quick role select</CardTitle>
								<CardDescription>
									Click a role to sign in instantly.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-2">
								{DEV_ACCOUNTS.map((account) => (
									<Button
										key={account.email}
										variant="outline"
										className="w-full justify-between"
										onClick={() => void handleQuickLogin(account.email)}
										disabled={isLoading}
									>
										<span className="font-mono text-xs">{account.email}</span>
										<Badge variant="outline">{account.label}</Badge>
									</Button>
								))}
							</CardContent>
						</Card>
					</>
				)}

				{isDev && hasCognito && (
					<div className="text-center">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setShowDevLogin((v) => !v)}
						>
							{showDevLogin
								? "Switch to production login"
								: "Switch to dev mode login"}
						</Button>
					</div>
				)}
			</div>
		</main>
	);
}

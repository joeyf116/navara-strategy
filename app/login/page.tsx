"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
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

const isDevMode =
	process.env.NODE_ENV !== "production" ||
	process.env.NEXT_PUBLIC_DEV_MODE === "true";

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
	const [providers, setProviders] = useState<Record<string, unknown> | null>(
		null,
	);
	const router = useRouter();

	useEffect(() => {
		let isMounted = true;

		void getProviders().then((availableProviders) => {
			if (!isMounted) return;
			setProviders(availableProviders);

			if (
				availableProviders?.["dev-credentials"] &&
				!availableProviders.cognito
			) {
				setShowDevLogin(true);
			} else if (
				availableProviders?.cognito &&
				!availableProviders["dev-credentials"]
			) {
				setShowDevLogin(false);
			}
		});

		return () => {
			isMounted = false;
		};
	}, []);

	const hasDevProvider = Boolean(providers?.["dev-credentials"]);
	const hasCognitoProvider = Boolean(providers?.cognito);
	const canUseDevLogin = providers ? hasDevProvider : isDevMode;
	const canUseCognitoLogin = providers ? hasCognitoProvider : !isDevMode;

	async function handleOAuthSignIn() {
		setIsLoading(true);
		setError("");
		const result = await signIn("cognito", {
			callbackUrl: "/",
			redirect: false,
		});

		if (result?.error) {
			setError(
				"AWS sign in is not configured in this local environment. Set AUTH_COGNITO_ID, AUTH_COGNITO_SECRET, and AUTH_COGNITO_ISSUER to enable it.",
			);
		}

		setIsLoading(false);
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
			router.push("/");
		}
		setIsLoading(false);
	}

	async function handleQuickLogin(accountEmail: string) {
		setEmail(accountEmail);
		setPassword("demo");
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
			router.push("/");
		}
		setIsLoading(false);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4">
			<div className="w-full max-w-md space-y-6">
				{/* Header */}
				<div className="text-center">
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
						<span className="text-lg font-bold text-primary-foreground">N</span>
					</div>
					<h1 className="mt-4 text-2xl font-bold">Navara Insights Portal</h1>
					<p className="text-muted-foreground">
						Sign in to access the operational dashboard
					</p>
				</div>

				{/* Production Login */}
				{!showDevLogin && canUseCognitoLogin && (
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
									viewBox="0 0 24 24"
									fill="currentColor"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M7.164 16.897l-1.39.738C7.36 19.791 9.552 21 12 21c1.73 0 3.456-.584 4.857-1.588l-1.326-.86A7.322 7.322 0 0 1 12 19.5a7.384 7.384 0 0 1-4.836-1.603Z" />
									<path d="M18.5 13.5c0-.644-.088-1.274-.248-1.875l7.398-3.327L12 1 .35 8.298l7.276 3.274A6.5 6.5 0 0 0 18.5 13.5Zm-6.5-9l8.026 4.997L12 14.494 3.974 9.497 12 4.5Z" />
								</svg>
								{isLoading ? "Redirecting..." : "Sign in with AWS"}
							</Button>
							{error && <p className="text-sm text-destructive">{error}</p>}
							{!canUseCognitoLogin && (
								<p className="text-sm text-muted-foreground">
									AWS sign in is unavailable until the Cognito env vars are set.
								</p>
							)}
						</CardContent>
					</Card>
				)}

				{/* Dev Mode Login */}
				{showDevLogin && canUseDevLogin && (
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
									{error && <p className="text-sm text-destructive">{error}</p>}
									<Button type="submit" className="w-full" disabled={isLoading}>
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
				{isDevMode && hasDevProvider && hasCognitoProvider && (
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

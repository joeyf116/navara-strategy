"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	Apple,
	Database,
	HardDrive,
	KeyRound,
	Monitor,
	Server,
	Terminal,
} from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { AppPasswordsPanel } from "@/components/features/settings/app-passwords-panel";
import { CopyField } from "@/components/shared/copy-field";
import { ErrorState } from "@/components/shared/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ConnectionInfo = {
	sftpEndpoint: string;
	webdavUrl: string;
	userEmail: string;
	companies: string[];
	isSuperAdmin: boolean;
	database: {
		host: string;
		port: string;
		database: string;
		username: string;
		password: string;
		sslMode: string;
		connectionString: string;
	} | null;
};

type DatabaseVerifyResponse = {
	ok: boolean;
	database: string;
	username: string;
	serverVersion: string;
	verifiedAt: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	const payload = (await response.json().catch(() => ({}))) as T & {
		error?: string;
	};
	if (!response.ok) {
		throw new Error(payload.error ?? "Request failed.");
	}
	return payload;
}

export default function SettingsPage() {
	const {
		data: connection = null,
		isLoading,
		isError,
		refetch,
	} = useQuery<ConnectionInfo>({
		queryKey: ["connection-info"],
		queryFn: () => requestJson<ConnectionInfo>("/api/settings/connection-info"),
	});
	const [dbStatus, setDbStatus] = useState<{
		message: string;
		error?: boolean;
	} | null>(null);

	const verifyDatabaseMutation = useMutation({
		mutationFn: () =>
			requestJson<DatabaseVerifyResponse>("/api/settings/database/verify", {
				method: "POST",
			}),
		onSuccess: (result) => {
			setDbStatus({
				message: `Connection verified for ${result.username} on ${result.database} at ${new Date(result.verifiedAt).toLocaleString()}.`,
			});
		},
		onError: (error) => {
			setDbStatus({
				message:
					error instanceof Error
						? error.message
						: "Database verification failed.",
				error: true,
			});
		},
	});

	return (
		<div className="flex flex-col gap-8">
			<PageHeader
				title="Settings"
				description="Set up your network drive, SFTP connection, and app passwords."
			/>

			{/* ── Network Drive Setup ────────────────────────────────────────── */}
			<Card>
				<CardHeader className="border-b border-border pb-4">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
							<HardDrive className="h-5 w-5 text-primary" aria-hidden="true" />
						</div>
						<div>
							<CardTitle>Network Drive (WebDAV)</CardTitle>
							<CardDescription>
								Map your company files as a local drive on Windows, macOS, or
								Linux.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-6 pt-6">
					{isError ? (
						<ErrorState
							title="Unable to load connection details"
							description="Something went wrong while loading your connection details. Try again."
							onRetry={() => void refetch()}
						/>
					) : (
						<>
							{/* Step 1 – App password */}
							<section className="flex flex-col gap-3">
								<div className="flex items-center gap-2">
									<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
										1
									</div>
									<h3 className="text-sm font-semibold">
										Create an app password
									</h3>
									<Badge variant="outline" className="ml-auto text-xs">
										<KeyRound className="mr-1 h-3 w-3" aria-hidden="true" />
										Required for drive mapping
									</Badge>
								</div>
								<p className="pl-8 text-sm text-muted-foreground">
									App passwords let your OS authenticate over WebDAV without
									using your main login. Create one per device.
								</p>
								<div className="pl-8">
									<AppPasswordsPanel />
								</div>
							</section>

							<Separator />

							{/* Step 2 – WebDAV URL + per-OS instructions */}
							<section className="flex flex-col gap-3">
								<div className="flex items-center gap-2">
									<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
										2
									</div>
									<h3 className="text-sm font-semibold">
										Map your network drive
									</h3>
								</div>
								<div className="pl-8">
									<CopyField
										label="WebDAV URL"
										value={connection?.webdavUrl ?? ""}
										loading={isLoading}
									/>
								</div>

								<div className="pl-8">
									<Tabs defaultValue="windows">
										<TabsList>
											<TabsTrigger value="windows">
												<Monitor
													className="mr-1.5 h-3.5 w-3.5"
													aria-hidden="true"
												/>
												Windows
											</TabsTrigger>
											<TabsTrigger value="macos">
												<Apple
													className="mr-1.5 h-3.5 w-3.5"
													aria-hidden="true"
												/>
												macOS
											</TabsTrigger>
											<TabsTrigger value="linux">
												<Terminal
													className="mr-1.5 h-3.5 w-3.5"
													aria-hidden="true"
												/>
												Linux
											</TabsTrigger>
										</TabsList>

										{/* Windows */}
										<TabsContent
											value="windows"
											className="mt-4 flex flex-col gap-3"
										>
											<ol className="space-y-2 text-sm text-muted-foreground">
												<li className="flex gap-2">
													<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
														1
													</span>
													Open{" "}
													<strong className="text-foreground">
														File Explorer
													</strong>
													, right-click{" "}
													<strong className="text-foreground">This PC</strong>,
													and choose{" "}
													<strong className="text-foreground">
														Map network drive…
													</strong>
												</li>
												<li className="flex gap-2">
													<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
														2
													</span>
													Choose a drive letter, paste the WebDAV URL above into{" "}
													<strong className="text-foreground">Folder</strong>,
													and tick{" "}
													<strong className="text-foreground">
														Reconnect at sign-in
													</strong>
													.
												</li>
												<li className="flex gap-2">
													<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
														3
													</span>
													When prompted, enter your email as the{" "}
													<strong className="text-foreground">username</strong>{" "}
													and the app password you created above.
												</li>
											</ol>
											<p className="text-xs text-muted-foreground">
												<strong>Tip:</strong> If the drive mapping wizard is
												greyed out, ensure the <em>WebClient</em> Windows
												service is running (
												<code className="rounded bg-muted px-1 text-xs">
													services.msc
												</code>{" "}
												→ WebClient → Start).
											</p>
										</TabsContent>

										{/* macOS */}
										<TabsContent
											value="macos"
											className="mt-4 flex flex-col gap-3"
										>
											<ol className="space-y-2 text-sm text-muted-foreground">
												<li className="flex gap-2">
													<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
														1
													</span>
													In Finder press{" "}
													<kbd className="rounded border px-1 font-mono text-xs">
														⌘ K
													</kbd>{" "}
													to open{" "}
													<strong className="text-foreground">
														Connect to Server
													</strong>
													.
												</li>
												<li className="flex gap-2">
													<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
														2
													</span>
													Paste the WebDAV URL into the{" "}
													<strong className="text-foreground">
														Server Address
													</strong>{" "}
													field and click{" "}
													<strong className="text-foreground">Connect</strong>.
												</li>
												<li className="flex gap-2">
													<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
														3
													</span>
													Enter your email and the app password when prompted.
												</li>
											</ol>
										</TabsContent>

										{/* Linux */}
										<TabsContent
											value="linux"
											className="mt-4 flex flex-col gap-3"
										>
											<p className="text-sm text-muted-foreground">
												Mount using{" "}
												<code className="rounded bg-muted px-1 text-xs">
													davfs2
												</code>{" "}
												or a file manager like Nautilus / Dolphin:
											</p>
											<ol className="space-y-2 text-sm text-muted-foreground">
												<li className="flex gap-2">
													<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
														1
													</span>
													Install{" "}
													<code className="rounded bg-muted px-1 text-xs">
														davfs2
													</code>
													:{" "}
													<code className="rounded bg-muted px-1 text-xs">
														sudo apt install davfs2
													</code>
												</li>
												<li className="flex gap-2">
													<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
														2
													</span>
													<span>
														Mount:
														<br />
														<code className="mt-1 block rounded bg-muted px-2 py-1 text-xs">
															{`sudo mount -t davfs ${connection?.webdavUrl ?? "<WebDAV URL>"} /mnt/navara`}
														</code>
													</span>
												</li>
												<li className="flex gap-2">
													<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
														3
													</span>
													Enter your email and the app password when prompted.
												</li>
											</ol>
										</TabsContent>
									</Tabs>
								</div>
							</section>

						</>
					)}
				</CardContent>
			</Card>

			{/* ── SFTP ──────────────────────────────────────────────────────────── */}
			<Card>
				<CardHeader className="border-b border-border pb-4">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
							<Server
								className="h-5 w-5 text-muted-foreground"
								aria-hidden="true"
							/>
						</div>
						<div>
							<CardTitle>SFTP</CardTitle>
							<CardDescription>
								Connect with FileZilla, WinSCP, Cyberduck, or any SFTP client.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 pt-6">
					<div className="grid gap-3 sm:grid-cols-2">
						<CopyField
							label="Host"
							value={connection?.sftpEndpoint ?? ""}
							loading={isLoading}
						/>
						<CopyField label="Port" value="22" loading={isLoading} />
						<CopyField
							label="Username"
							value={connection?.userEmail ?? ""}
							loading={isLoading}
						/>
						<CopyField
							label="Password"
							value="Use your portal password"
							loading={isLoading}
						/>
					</div>
					{connection?.sftpEndpoint && connection?.userEmail ? (
						<CopyField
							label="Terminal command"
							value={`sftp -P 22 ${connection.userEmail}@${connection.sftpEndpoint}`}
						/>
					) : null}
					<p className="text-sm text-muted-foreground">
						For SFTP file-manager support on Windows, install{" "}
						<a
							href="https://github.com/winfsp/sshfs-win#installation"
							target="_blank"
							rel="noopener noreferrer"
							className="underline underline-offset-4 hover:text-foreground"
						>
							SSHFS-Win
						</a>
						.
					</p>
				</CardContent>
			</Card>

			{/* ── Database Access (super admin) ─────────────────────────────────── */}
			{connection?.isSuperAdmin ? (
				<Card>
					<CardHeader className="border-b border-border pb-4">
						<div className="flex items-center gap-3">
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
								<Database
									className="h-5 w-5 text-muted-foreground"
									aria-hidden="true"
								/>
							</div>
							<div>
								<CardTitle>Database Access</CardTitle>
								<CardDescription>
									Direct PostgreSQL credentials for administrators.
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="flex flex-col gap-4 pt-6">
						{connection.database ? (
							<>
								<div className="grid gap-3 sm:grid-cols-2">
									<CopyField label="Host" value={connection.database.host} />
									<CopyField label="Port" value={connection.database.port} />
									<CopyField
										label="Database"
										value={connection.database.database}
									/>
									<CopyField
										label="Username"
										value={connection.database.username}
									/>
									<CopyField
										label="Password"
										value={connection.database.password}
									/>
									<CopyField
										label="SSL Mode"
										value={connection.database.sslMode}
									/>
								</div>

								<CopyField
									label="Connection string"
									value={connection.database.connectionString}
								/>
								<CopyField
									label="psql command"
									value={`psql "${connection.database.connectionString}"`}
								/>

								<div className="flex flex-wrap items-center gap-3">
									<Button
										variant="outline"
										onClick={() => {
											setDbStatus(null);
											void verifyDatabaseMutation.mutateAsync();
										}}
										disabled={verifyDatabaseMutation.isPending}
									>
										{verifyDatabaseMutation.isPending ? (
											<Spinner data-icon="inline-start" aria-hidden="true" />
										) : null}
										{verifyDatabaseMutation.isPending
											? "Verifying…"
											: "Verify database connection"}
									</Button>
									<p className="text-sm text-muted-foreground">
										Runs a live connectivity check from the server.
									</p>
								</div>

								{dbStatus ? (
									<Alert variant={dbStatus.error ? "destructive" : "default"}>
										<AlertDescription>{dbStatus.message}</AlertDescription>
									</Alert>
								) : null}
							</>
						) : (
							<p className="text-sm text-muted-foreground">
								Database access is not configured for this environment.
							</p>
						)}
					</CardContent>
				</Card>
			) : null}

		</div>
	);
}

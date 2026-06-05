"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { UserAccessManagementTable } from "@/components/user-access-management-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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

function CopyField({
	label,
	value,
	placeholder = "Loading...",
}: {
	label: string;
	value: string;
	placeholder?: string;
}) {
	const [copied, setCopied] = useState(false);

	function copy() {
		if (!value) return;
		void navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<div className="space-y-1.5">
			<Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</Label>
			<div className="flex gap-2">
				<Input
					readOnly
					value={value}
					placeholder={placeholder}
					className="font-mono text-sm"
				/>
				<Button
					variant="outline"
					size="sm"
					onClick={copy}
					disabled={!value}
					aria-label={`Copy ${label}`}
				>
					{copied ? (
						<Check className="h-4 w-4 text-success" />
					) : (
						<Copy className="h-4 w-4" />
					)}
				</Button>
			</div>
		</div>
	);
}

export default function SettingsPage() {
	const { data: connection = null } = useQuery<ConnectionInfo>({
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
		<div className="space-y-6">
			<PageHeader
				title="Settings"
				description="Connection details and user access controls."
			/>

			{connection?.isSuperAdmin ? <UserAccessManagementTable /> : null}

			<Card>
				<CardHeader>
					<CardTitle>Connection Setup</CardTitle>
					<CardDescription>
						Use WebDAV for native mounts, SFTP for file clients, and database
						settings for admin SQL access.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Tabs defaultValue="webdav">
						<TabsList>
							<TabsTrigger value="webdav">WebDAV</TabsTrigger>
							<TabsTrigger value="sftp">SFTP</TabsTrigger>
							{connection?.isSuperAdmin ? (
								<TabsTrigger value="database">Database</TabsTrigger>
							) : null}
						</TabsList>
						<TabsContent value="webdav" className="space-y-3 pt-4">
							<CopyField
								label="WebDAV URL"
								value={connection?.webdavUrl ?? ""}
							/>
							<p className="text-sm text-muted-foreground">
								Map this URL as a network drive in Windows File Explorer or
								connect in macOS Finder with Connect to Server.
							</p>
						</TabsContent>
						<TabsContent value="sftp" className="space-y-3 pt-4">
							<div className="grid gap-3 sm:grid-cols-2">
								<CopyField label="Host" value={connection?.sftpEndpoint ?? ""} />
								<CopyField label="Port" value="22" />
								<CopyField
									label="Username"
									value={connection?.userEmail ?? ""}
								/>
								<CopyField label="Password" value="Use your portal password" />
							</div>
							{connection?.sftpEndpoint && connection?.userEmail ? (
								<CopyField
									label="Terminal Command"
									value={`sftp -P 22 ${connection.userEmail}@${connection.sftpEndpoint}`}
								/>
							) : null}
						</TabsContent>
						{connection?.isSuperAdmin ? (
							<TabsContent value="database" className="space-y-4 pt-4">
								{connection.database ? (
									<>
										<div className="grid gap-3 sm:grid-cols-2">
											<CopyField
												label="Host"
												value={connection.database.host}
											/>
											<CopyField
												label="Port"
												value={connection.database.port}
											/>
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
											label="Connection String"
											value={connection.database.connectionString}
										/>
										<CopyField
											label="PSQL Command"
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
												{verifyDatabaseMutation.isPending
													? "Verifying..."
													: "Verify database connection"}
											</Button>
											<p className="text-sm text-muted-foreground">
												Verifies real connectivity using the server-side
												DATABASE_URL.
											</p>
										</div>

										{dbStatus ? (
											<Alert
												variant={dbStatus.error ? "destructive" : "default"}
											>
												<AlertDescription>{dbStatus.message}</AlertDescription>
											</Alert>
										) : null}
									</>
								) : (
									<p className="text-sm text-muted-foreground">
										DATABASE_URL is not configured in the application runtime.
									</p>
								)}
							</TabsContent>
						) : null}
					</Tabs>

					<Separator />

					<div className="space-y-2 text-sm text-muted-foreground">
						<p className="font-medium text-foreground">Client shortcuts</p>
						<p>
							FileZilla / WinSCP / Cyberduck: use SFTP, host + port 22, username
							= portal email.
						</p>
						<p>
							For persistent drive mapping on Windows, install{" "}
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
					</div>

					{connection?.companies?.length ? (
						<p className="text-xs text-muted-foreground">
							Accessible companies: {connection.companies.join(", ")}
						</p>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}

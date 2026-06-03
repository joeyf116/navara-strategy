"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";

import { UserAccessManagementTable } from "@/components/user-access-management-table";
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
						<Check className="h-4 w-4 text-green-600" />
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

	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h1 className="text-xl font-semibold text-balance">Settings</h1>
				<p className="text-xs text-muted-foreground">
					Connection details and user access controls.
				</p>
			</div>

			{connection?.isSuperAdmin ? <UserAccessManagementTable /> : null}

			<Card>
				<CardHeader>
					<CardTitle>Connection Setup</CardTitle>
					<CardDescription>
						Use WebDAV for native mounts or SFTP for client tools.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Tabs defaultValue="webdav">
						<TabsList className="h-8">
							<TabsTrigger value="webdav">WebDAV</TabsTrigger>
							<TabsTrigger value="sftp">SFTP</TabsTrigger>
						</TabsList>
						<TabsContent value="webdav" className="space-y-3 pt-2">
							<CopyField
								label="WebDAV URL"
								value={connection?.webdavUrl ?? ""}
							/>
							<p className="text-xs text-muted-foreground">
								Map this URL as a network drive in Windows File Explorer or
								connect in macOS Finder with Connect to Server.
							</p>
						</TabsContent>
						<TabsContent value="sftp" className="space-y-3 pt-2">
							<div className="grid gap-3 sm:grid-cols-2">
								<CopyField
									label="Host"
									value={connection?.sftpEndpoint ?? ""}
								/>
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
					</Tabs>

					<Separator />

					<div className="space-y-2 text-xs text-muted-foreground">
						<p className="font-medium text-foreground">Client Shortcuts</p>
						<p>
							FileZilla / WinSCP / Cyberduck: use SFTP, host + port 22, username
							= portal email.
						</p>
						<p>
							For persistent drive mapping on Windows, install
							<a
								href="https://github.com/winfsp/sshfs-win#installation"
								target="_blank"
								rel="noopener noreferrer"
								className="ml-1 underline"
							>
								SSHFS-Win
							</a>
							.
						</p>
					</div>

					{connection?.companies?.length ? (
						<p className="text-[11px] text-muted-foreground">
							Accessible companies: {connection.companies.join(", ")}
						</p>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}

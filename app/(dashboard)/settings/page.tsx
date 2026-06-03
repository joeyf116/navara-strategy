"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";

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

type ConnectionInfo = {
	sftpEndpoint: string;
	userEmail: string;
};

function CopyField({
	label,
	value,
	placeholder = "Loading…",
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
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className="space-y-1.5">
			<Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
					className="shrink-0 px-3"
				>
					{copied ? (
						<Check className="h-4 w-4 text-green-500" />
					) : (
						<Copy className="h-4 w-4" />
					)}
				</Button>
			</div>
		</div>
	);
}

export default function SettingsPage() {
	const {
		data: conn = {
			sftpEndpoint: "",
			userEmail: "",
		},
	} = useQuery<ConnectionInfo>({
		queryKey: ["connection-info"],
		queryFn: async () => {
			const response = await fetch("/api/settings/connection-info");
			if (!response.ok) throw new Error("Failed to load connection info.");
			return response.json() as Promise<ConnectionInfo>;
		},
	});

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">File Share Connection</h1>
				<p className="text-muted-foreground">
					Connect your file explorer to Navara using SFTP.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>AWS Transfer Family — SFTP</CardTitle>
					<CardDescription>
						Connect any SFTP client (Cyberduck, FileZilla, WinSCP, or the
						terminal) using the values below. Sign in with your portal email and
						password.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<CopyField label="Host" value={conn.sftpEndpoint} />
						<CopyField label="Port" value="22" placeholder="22" />
						<CopyField
							label="Username"
							value={conn.userEmail}
							placeholder="your account email"
						/>
						<CopyField
							label="Password"
							value="Your portal password"
							placeholder="Your portal password"
						/>
					</div>

					{conn.sftpEndpoint && conn.userEmail ? (
						<>
							<Separator />
							<CopyField
								label="Terminal quick-connect"
								value={`sftp -P 22 ${conn.userEmail}@${conn.sftpEndpoint}`}
							/>
						</>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>GUI Client Instructions</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground">
					<div className="space-y-1">
						<p className="font-medium text-foreground">
							Cyberduck / Mountain Duck
						</p>
						<p>
							New Bookmark → <strong>SFTP</strong> → paste Host and Port → enter
							your email as the username → Logon Type: <strong>Normal</strong> →
							enter your portal password.
						</p>
					</div>
					<Separator />
					<div className="space-y-1">
						<p className="font-medium text-foreground">FileZilla</p>
						<p>
							File → Site Manager → New Site → Protocol: <strong>SFTP</strong> →
							paste Host, Port 22 → Logon Type: <strong>Normal</strong> → enter
							your email and portal password.
						</p>
					</div>
					<Separator />
					<div className="space-y-1">
						<p className="font-medium text-foreground">WinSCP</p>
						<p>
							New Session → File Protocol: <strong>SFTP</strong> → paste Host
							name, Port 22 → enter your email and portal password → Login.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AppPassword = {
	id: string;
	label: string;
	tokenPrefix: string;
	createdAt: string;
	lastUsedAt: string | null;
};

type ConnectionInfo = {
	sftpEndpoint: string;
	webdavUrl: string;
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
	const queryClient = useQueryClient();
	const [label, setLabel] = useState("");
	const [newToken, setNewToken] = useState("");
	const [passwordStatus, setPasswordStatus] = useState("");

	const {
		data: conn = {
			sftpEndpoint: "",
			webdavUrl: "",
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

	const { data: passwords = [] } = useQuery<AppPassword[]>({
		queryKey: ["app-passwords"],
		queryFn: async () => {
			const response = await fetch("/api/settings/app-passwords");
			const payload = (await response.json()) as {
				passwords?: AppPassword[];
				error?: string;
			};
			if (!response.ok)
				throw new Error(payload.error ?? "Failed to load passwords.");
			return payload.passwords ?? [];
		},
	});

	// webDavHost for the Windows UNC path fallback
	const webDavHost = conn.webdavUrl
		? new URL(conn.webdavUrl).host
		: "your-domain.com";

	// The UNC path Windows File Explorer accepts as an alternative
	const windowsUncPath = `\\\\${webDavHost}@SSL\\DavWWWRoot\\api\\dav`;

	// Terminal quick-connect command
	const sftpCommand = conn.sftpEndpoint
		? `sftp -P 22 <your-username>@${conn.sftpEndpoint}`
		: "";

	async function loadPasswords() {
		await queryClient.invalidateQueries({ queryKey: ["app-passwords"] });
	}

	async function createPassword() {
		const trimmed = label.trim();
		if (!trimmed) {
			setPasswordStatus("Label is required.");
			return;
		}

		const response = await fetch("/api/settings/app-passwords", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ label: trimmed }),
		});

		const payload = (await response.json()) as {
			token?: string;
			error?: string;
		};

		if (!response.ok) {
			setPasswordStatus(payload.error ?? "Failed to create app password.");
			return;
		}

		setNewToken(payload.token ?? "");
		setLabel("");
		setPasswordStatus("App password created. Copy it now — it is shown once.");
		await loadPasswords();
	}

	async function revokePassword(id: string) {
		const response = await fetch("/api/settings/app-passwords", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id }),
		});

		if (!response.ok) {
			setPasswordStatus("Failed to revoke app password.");
			return;
		}

		setNewToken("");
		await loadPasswords();
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">File Share Connection</h1>
				<p className="text-muted-foreground">
					Connect your file explorer to Navara using SFTP (primary) or WebDAV
					(desktop mount).
				</p>
			</div>

			<Tabs defaultValue="sftp">
				<TabsList>
					<TabsTrigger value="sftp">SFTP (Primary)</TabsTrigger>
					<TabsTrigger value="webdav">WebDAV (Network Drive)</TabsTrigger>
				</TabsList>

				{/* ── SFTP Tab ── */}
				<TabsContent value="sftp" className="space-y-4 mt-4">
					<Card>
						<CardHeader>
							<CardTitle>AWS Transfer Family — SFTP</CardTitle>
							<CardDescription>
								Connect any SFTP client (Cyberduck, FileZilla, WinSCP, or the
								terminal) using the values below. Authentication uses your SSH
								private key.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-2">
								<CopyField label="Host" value={conn.sftpEndpoint} />
								<CopyField label="Port" value="22" placeholder="22" />
								<CopyField
									label="Username"
									value=""
									placeholder="Assigned by your administrator"
								/>
								<CopyField
									label="Authentication"
									value="SSH Key (private key)"
									placeholder="SSH Key"
								/>
							</div>

							{sftpCommand ? (
								<>
									<Separator />
									<CopyField
										label="Terminal quick-connect"
										value={sftpCommand}
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
									New Bookmark → <strong>SFTP</strong> → paste Host and Username
									→ set SSH Key under &ldquo;SSH Private Key&rdquo;.
								</p>
							</div>
							<Separator />
							<div className="space-y-1">
								<p className="font-medium text-foreground">FileZilla</p>
								<p>
									File → Site Manager → New Site → Protocol:{" "}
									<strong>SFTP</strong> → paste Host, Port 22, Username → set
									Key file under Logon Type: Key file.
								</p>
							</div>
							<Separator />
							<div className="space-y-1">
								<p className="font-medium text-foreground">WinSCP</p>
								<p>
									New Session → File Protocol: <strong>SFTP</strong> → paste
									Host name, Port 22, User name → Advanced → SSH →
									Authentication → select your private key file.
								</p>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				{/* ── WebDAV Tab ── */}
				<TabsContent value="webdav" className="space-y-4 mt-4">
					<Card>
						<CardHeader>
							<CardTitle>WebDAV Connection Details</CardTitle>
							<CardDescription>
								Mount Navara as a network drive using WebDAV. Use an app
								password as the password — your account password is not
								accepted.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="sm:col-span-2">
									<CopyField label="WebDAV URL" value={conn.webdavUrl} />
								</div>
								<CopyField
									label="Username"
									value={conn.userEmail}
									placeholder="your account email"
								/>
								<CopyField
									label="Password"
									value="Use an app password (see below)"
									placeholder="App password token"
								/>
							</div>

							<Separator />

							<div className="space-y-1">
								<p className="font-medium text-foreground text-sm">
									Windows (File Explorer)
								</p>
								<p className="text-sm text-muted-foreground">
									File Explorer → This PC → Map network drive → &ldquo;Connect
									to a Web site&rdquo; → paste the WebDAV URL above.
								</p>
								<div className="mt-2">
									<CopyField
										label="Windows UNC path (alternative)"
										value={windowsUncPath}
									/>
								</div>
							</div>

							<Separator />

							<div className="space-y-1">
								<p className="font-medium text-foreground text-sm">
									macOS (Finder)
								</p>
								<p className="text-sm text-muted-foreground">
									Finder → Go → Connect to Server → paste the WebDAV URL above →
									sign in with Registered User using your email and app
									password.
								</p>
							</div>
						</CardContent>
					</Card>

					{/* App password management */}
					<Card>
						<CardHeader>
							<CardTitle>App Passwords</CardTitle>
							<CardDescription>
								Generate a password for each device or application. Each token
								is shown once.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex gap-2">
								<Input
									placeholder="Label (e.g. Work Laptop)"
									value={label}
									onChange={(event) => setLabel(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") void createPassword();
									}}
								/>
								<Button onClick={() => void createPassword()}>Create</Button>
							</div>

							{newToken ? (
								<div className="rounded-md border border-border bg-muted p-3 space-y-2">
									<p className="text-sm font-medium">
										Copy this token now — it will not be shown again.
									</p>
									<CopyField label="One-time token" value={newToken} />
								</div>
							) : null}

							{passwordStatus ? (
								<p className="text-sm text-muted-foreground">
									{passwordStatus}
								</p>
							) : null}

							<Separator />

							<div className="space-y-2">
								{passwords.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No app passwords yet.
									</p>
								) : (
									passwords.map((password) => (
										<div
											key={password.id}
											className="flex items-center justify-between rounded-md border border-border p-3"
										>
											<div>
												<p className="text-sm font-medium">{password.label}</p>
												<p className="text-xs text-muted-foreground">
													Prefix: {password.tokenPrefix} · Created{" "}
													{new Date(password.createdAt).toLocaleString()} · Last
													used{" "}
													{password.lastUsedAt
														? new Date(password.lastUsedAt).toLocaleString()
														: "never"}
												</p>
											</div>
											<Button
												variant="outline"
												size="sm"
												onClick={() => void revokePassword(password.id)}
											>
												Revoke
											</Button>
										</div>
									))
								)}
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}

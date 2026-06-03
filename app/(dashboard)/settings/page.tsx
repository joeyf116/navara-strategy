"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AppPassword = {
	id: string;
	label: string;
	tokenPrefix: string;
	createdAt: string;
	lastUsedAt: string | null;
};

export default function SettingsPage() {
	const [passwords, setPasswords] = useState<AppPassword[]>([]);
	const [label, setLabel] = useState("");
	const [newToken, setNewToken] = useState("");
	const [status, setStatus] = useState("");
	const [origin, setOrigin] = useState("");

	const webDavEndpoint = origin
		? `${origin}/api/dav`
		: "https://your-domain.com/api/dav";
	const webDavHost = origin ? new URL(origin).host : "your-domain.com";

	async function load() {
		const response = await fetch("/api/settings/app-passwords");
		const payload = (await response.json()) as {
			passwords?: AppPassword[];
			error?: string;
		};

		if (!response.ok) {
			setStatus(payload.error ?? "Failed to load app passwords.");
			return;
		}

		setPasswords(payload.passwords ?? []);
	}

	useEffect(() => {
		const id = window.setTimeout(() => {
			setOrigin(window.location.origin);
			void load();
		}, 0);

		return () => {
			window.clearTimeout(id);
		};
	}, []);

	async function createPassword() {
		const trimmed = label.trim();
		if (!trimmed) {
			setStatus("Label is required.");
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
			setStatus(payload.error ?? "Failed to create app password.");
			return;
		}

		setNewToken(payload.token ?? "");
		setLabel("");
		setStatus("App password created. Copy it now; it is shown once.");
		await load();
	}

	async function revokePassword(id: string) {
		const response = await fetch("/api/settings/app-passwords", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id }),
		});

		if (!response.ok) {
			setStatus("Failed to revoke app password.");
			return;
		}

		await load();
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Network Drive Settings</h1>
				<p className="text-muted-foreground">
					AWS Transfer Family (SFTP) is the primary file-sharing path. Use
					WebDAV below for desktop file explorer access.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Primary File Share Path (AWS Transfer Family)</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm text-muted-foreground">
					<p>Production file exchange is backed by AWS Transfer Family SFTP.</p>
					<p>
						Use Terraform outputs to confirm the active endpoint and username.
					</p>
					<p className="font-mono text-xs text-foreground">
						terraform output sftp_endpoint
					</p>
					<p className="font-mono text-xs text-foreground">
						terraform output sftp_username
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Create App Password</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex gap-2">
						<Input
							placeholder="Label (e.g. Work Laptop)"
							value={label}
							onChange={(event) => setLabel(event.target.value)}
						/>
						<Button onClick={() => void createPassword()}>Create</Button>
					</div>

					{newToken ? (
						<div className="rounded-md border border-border bg-muted p-3 text-sm">
							<p className="font-medium">One-time token</p>
							<p className="break-all">{newToken}</p>
						</div>
					) : null}

					{status ? (
						<p className="text-sm text-muted-foreground">{status}</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Existing App Passwords</CardTitle>
				</CardHeader>
				<CardContent>
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
										<p className="font-medium">{password.label}</p>
										<p className="text-xs text-muted-foreground">
											Prefix: {password.tokenPrefix} | Created:{" "}
											{new Date(password.createdAt).toLocaleString()} | Last
											used:{" "}
											{password.lastUsedAt
												? new Date(password.lastUsedAt).toLocaleString()
												: "Never"}
										</p>
									</div>
									<Button
										variant="outline"
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

			<Card>
				<CardHeader>
					<CardTitle>Connect OS File Explorer</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3 text-sm text-muted-foreground">
					<p className="font-medium text-foreground">Connection values</p>
					<p>
						WebDAV URL: <span className="font-mono">{webDavEndpoint}</span>
					</p>
					<p>Username: your account email</p>
					<p>Password: app password token generated above</p>
					<p className="font-medium text-foreground">Windows (File Explorer)</p>
					<p>
						Open File Explorer - This PC - Map network drive - Connect to a web
						site.
					</p>
					<p>
						Use this folder URL:{" "}
						<span className="font-mono">{webDavEndpoint}</span>
					</p>
					<p>
						If prompted for a UNC path, use{" "}
						<span className="font-mono">
							{`\\\\${webDavHost}@SSL\\DavWWWRoot\\api\\dav`}
						</span>
						.
					</p>
					<p className="font-medium text-foreground">macOS (Finder)</p>
					<p>
						Open Finder - Go - Connect to Server, then enter{" "}
						<span className="font-mono">{webDavEndpoint}</span>.
					</p>
					<p>
						Sign in with Registered User, using your account email and app
						password token.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}

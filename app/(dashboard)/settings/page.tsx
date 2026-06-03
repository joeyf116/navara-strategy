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
					Generate app passwords for Basic Auth over WebDAV at /api/dav.
				</p>
			</div>

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
				<CardContent className="space-y-2 text-sm text-muted-foreground">
					<p>Endpoint: https://your-domain.com/api/dav</p>
					<p>Username: your account email</p>
					<p>Password: app password token generated above</p>
				</CardContent>
			</Card>
		</div>
	);
}

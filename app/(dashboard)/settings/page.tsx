"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ConnectionInfo = {
	sftpEndpoint: string;
	webdavUrl: string;
	userEmail: string;
	companies: string[];
	isSuperAdmin: boolean;
};

type CompanyAccessResponse = {
	allCompanies: string[];
	currentUser: {
		isSuperAdmin: boolean;
		grants: Array<{ companyId: string; canWrite: boolean }>;
	};
};

type CognitoUsersResponse = {
	users: Array<{
		username: string;
		email: string;
		enabled: boolean;
		status: string;
	}>;
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
	const [newCompanyId, setNewCompanyId] = useState("");
	const [selectedCompanyId, setSelectedCompanyId] = useState("");
	const [userSearch, setUserSearch] = useState("");
	const [selectedUserEmail, setSelectedUserEmail] = useState("");
	const [selectedUserHasAccess, setSelectedUserHasAccess] = useState(false);
	const [selectedUserCanWrite, setSelectedUserCanWrite] = useState(true);
	const [selectedUserBaseGrants, setSelectedUserBaseGrants] = useState<
		Array<{ companyId: string; canWrite: boolean }>
	>([]);
	const [loadingUserAccess, setLoadingUserAccess] = useState(false);
	const [adminStatus, setAdminStatus] = useState<string | null>(null);
	const [adminError, setAdminError] = useState<string | null>(null);
	const [adminWorking, setAdminWorking] = useState(false);

	const {
		data: conn = {
			sftpEndpoint: "",
			webdavUrl: "",
			userEmail: "",
			companies: [],
			isSuperAdmin: false,
		},
	} = useQuery<ConnectionInfo>({
		queryKey: ["connection-info"],
		queryFn: async () => {
			const response = await fetch("/api/settings/connection-info");
			if (!response.ok) throw new Error("Failed to load connection info.");
			return response.json() as Promise<ConnectionInfo>;
		},
	});

	const { data: companyAccess } = useQuery<CompanyAccessResponse>({
		queryKey: ["company-access"],
		queryFn: async () => {
			const response = await fetch("/api/settings/company-access");
			if (!response.ok) throw new Error("Failed to load company access.");
			return response.json() as Promise<CompanyAccessResponse>;
		},
	});

	const { data: cognitoUsersResponse } = useQuery<CognitoUsersResponse>({
		queryKey: ["company-access-users"],
		enabled: conn.isSuperAdmin,
		queryFn: async () => {
			const response = await fetch("/api/settings/company-access/users");
			if (!response.ok) throw new Error("Failed to load Cognito users.");
			return response.json() as Promise<CognitoUsersResponse>;
		},
	});

	const allCompanies = companyAccess?.allCompanies ?? [];
	const activeCompanyId = selectedCompanyId || allCompanies[0] || "";

	function syncCompanyPermissionDraft(
		companyId: string,
		grants: Array<{ companyId: string; canWrite: boolean }>,
	) {
		const grant = grants.find((item) => item.companyId === companyId);
		setSelectedUserHasAccess(Boolean(grant));
		setSelectedUserCanWrite(grant?.canWrite !== false);
	}

	function onCompanyChange(nextCompanyId: string) {
		setSelectedCompanyId(nextCompanyId);
		syncCompanyPermissionDraft(nextCompanyId, selectedUserBaseGrants);
	}

	const filteredUsers = useMemo(() => {
		const cognitoUsers = cognitoUsersResponse?.users ?? [];
		const normalized = userSearch.trim().toLowerCase();
		if (!normalized) return cognitoUsers;
		return cognitoUsers.filter((user) => {
			return (
				user.email.toLowerCase().includes(normalized) ||
				user.username.toLowerCase().includes(normalized)
			);
		});
	}, [cognitoUsersResponse?.users, userSearch]);

	async function createCompanyAction() {
		const companyId = newCompanyId.trim();
		if (!companyId) return;

		setAdminStatus(null);
		setAdminError(null);
		setAdminWorking(true);
		const response = await fetch("/api/settings/company-access", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "createCompany", companyId }),
		});
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
			companyId?: string;
		};
		setAdminWorking(false);

		if (!response.ok) {
			setAdminError(payload.error ?? "Failed to create company.");
			return;
		}

		setNewCompanyId("");
		const createdCompany = payload.companyId ?? companyId;
		setSelectedCompanyId(createdCompany);
		syncCompanyPermissionDraft(createdCompany, selectedUserBaseGrants);
		setAdminStatus(`Created company ${createdCompany}.`);
		await queryClient.invalidateQueries({ queryKey: ["company-access"] });
		await queryClient.invalidateQueries({ queryKey: ["connection-info"] });
	}

	async function loadUserAccessAction(userEmail: string) {
		if (!userEmail.trim()) return;

		setAdminStatus(null);
		setAdminError(null);
		setSelectedUserEmail(userEmail);
		setLoadingUserAccess(true);
		const response = await fetch(
			`/api/settings/company-access?userEmail=${encodeURIComponent(userEmail)}`,
		);
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
			targetUser?: {
				grants?: Array<{ companyId: string; canWrite: boolean }>;
			};
		};
		setLoadingUserAccess(false);

		if (!response.ok) {
			setAdminError(payload.error ?? "Failed to load user access.");
			setSelectedUserBaseGrants([]);
			return;
		}

		const nextGrants = payload.targetUser?.grants ?? [];
		setSelectedUserBaseGrants(nextGrants);
		syncCompanyPermissionDraft(activeCompanyId, nextGrants);
	}

	async function saveUserAccessAction() {
		const userEmail = selectedUserEmail.trim().toLowerCase();
		const companyId = activeCompanyId.trim();
		if (!userEmail || !companyId) return;

		const grants = selectedUserBaseGrants.filter(
			(grant) => grant.companyId !== companyId,
		);
		if (selectedUserHasAccess) {
			grants.push({ companyId, canWrite: selectedUserCanWrite });
		}

		setAdminStatus(null);
		setAdminError(null);
		setAdminWorking(true);
		const response = await fetch("/api/settings/company-access", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "setUserAccess",
				userEmail,
				grants,
			}),
		});
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
			grants?: Array<{ companyId: string; canWrite: boolean }>;
		};
		setAdminWorking(false);

		if (!response.ok) {
			setAdminError(payload.error ?? "Failed to save user access.");
			return;
		}

		setSelectedUserBaseGrants(payload.grants ?? grants);
		syncCompanyPermissionDraft(companyId, payload.grants ?? grants);
		setAdminStatus(`Updated ${userEmail} permissions for ${companyId}.`);
		await queryClient.invalidateQueries({ queryKey: ["company-access"] });
		await queryClient.invalidateQueries({ queryKey: ["connection-info"] });
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">File Share Connection</h1>
				<p className="text-muted-foreground">
					Connect your file explorer to Navara using SFTP or WebDAV.
				</p>
			</div>

			{conn.isSuperAdmin && (
				<Card>
					<CardHeader>
						<CardTitle>Company Access Management</CardTitle>
						<CardDescription>
							Create company roots and assign users to one or more companies.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="new-company">Create company</Label>
								<div className="flex gap-2">
									<Input
										id="new-company"
										placeholder="acme-corp"
										value={newCompanyId}
										onChange={(event) => setNewCompanyId(event.target.value)}
									/>
									<Button
										onClick={() => void createCompanyAction()}
										disabled={!newCompanyId.trim() || adminWorking}
									>
										Create
									</Button>
								</div>
							</div>
							<div className="space-y-2">
								<Label htmlFor="all-companies">Known companies</Label>
								<Input
									id="all-companies"
									readOnly
									value={(companyAccess?.allCompanies ?? []).join(", ")}
									placeholder="No companies yet"
								/>
							</div>
						</div>

						<Separator />

						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="manage-company">Manage company</Label>
								<Select
									value={activeCompanyId}
									onValueChange={onCompanyChange}
									disabled={allCompanies.length === 0}
								>
									<SelectTrigger id="manage-company">
										<SelectValue placeholder="Create a company first" />
									</SelectTrigger>
									<SelectContent>
										{allCompanies.map((companyId) => (
											<SelectItem key={companyId} value={companyId}>
												{companyId}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="user-search">Search Cognito users</Label>
								<Input
									id="user-search"
									placeholder="Search by email or username"
									value={userSearch}
									onChange={(event) => setUserSearch(event.target.value)}
								/>
							</div>
						</div>

						<div className="rounded-md border">
							<div className="max-h-72 overflow-y-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>User</TableHead>
											<TableHead>Status</TableHead>
											<TableHead className="text-right">Action</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{filteredUsers.length === 0 ? (
											<TableRow>
												<TableCell
													colSpan={3}
													className="text-muted-foreground"
												>
													No matching Cognito users found.
												</TableCell>
											</TableRow>
										) : (
											filteredUsers.map((user) => {
												const isSelected = user.email === selectedUserEmail;
												return (
													<TableRow
														key={user.username}
														className={isSelected ? "bg-accent/40" : ""}
													>
														<TableCell>
															<div className="font-medium">{user.email}</div>
															<div className="text-xs text-muted-foreground">
																{user.username}
															</div>
														</TableCell>
														<TableCell>
															<Badge
																variant={user.enabled ? "success" : "warning"}
															>
																{user.enabled ? user.status : "DISABLED"}
															</Badge>
														</TableCell>
														<TableCell className="text-right">
															<Button
																size="sm"
																variant={isSelected ? "default" : "outline"}
																onClick={() =>
																	void loadUserAccessAction(user.email)
																}
																disabled={loadingUserAccess}
															>
																{isSelected ? "Selected" : "Manage"}
															</Button>
														</TableCell>
													</TableRow>
												);
											})
										)}
									</TableBody>
								</Table>
							</div>
						</div>

						{selectedUserEmail && activeCompanyId && (
							<div className="space-y-3 rounded-md border p-4">
								<p className="text-sm text-muted-foreground">
									Managing{" "}
									<span className="font-medium text-foreground">
										{selectedUserEmail}
									</span>{" "}
									for company{" "}
									<span className="font-medium text-foreground">
										{activeCompanyId}
									</span>
									.
								</p>
								<div className="flex flex-wrap items-center gap-3">
									<div className="flex items-center gap-2">
										<Switch
											checked={selectedUserHasAccess}
											onCheckedChange={setSelectedUserHasAccess}
										/>
										<Label>Company access</Label>
									</div>
									<div className="flex items-center gap-2">
										<Switch
											checked={selectedUserCanWrite}
											onCheckedChange={setSelectedUserCanWrite}
											disabled={!selectedUserHasAccess}
										/>
										<Label>Write permission</Label>
									</div>
									<Button
										onClick={() => void saveUserAccessAction()}
										disabled={adminWorking || loadingUserAccess}
									>
										Save Permission
									</Button>
								</div>
							</div>
						)}

						<div className="flex items-center gap-2">
							{adminStatus && (
								<p className="text-sm text-muted-foreground">{adminStatus}</p>
							)}
							{adminError && (
								<p className="text-sm text-destructive">{adminError}</p>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{/* ── Native Drive Mapping ─────────────────────────────────────── */}
			<Card>
				<CardHeader>
					<CardTitle>Mount as a Network Drive</CardTitle>
					<CardDescription>
						Map your Navara folder directly into Windows File Explorer or macOS
						Finder — no third-party software required for the WebDAV method.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Tabs defaultValue="windows">
						<TabsList className="mb-4">
							<TabsTrigger value="windows">Windows</TabsTrigger>
							<TabsTrigger value="macos">macOS</TabsTrigger>
						</TabsList>

						{/* ── Windows ───────────────────────────────────────────── */}
						<TabsContent value="windows" className="space-y-6 text-sm">
							{/* Option A — WebDAV (built-in, no software) */}
							<div className="space-y-3">
								<p className="font-semibold text-foreground">
									Option A — WebDAV (built-in, no extra software)
								</p>
								<ol className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed">
									<li>
										Open <strong>File Explorer</strong>, right-click{" "}
										<strong>This PC</strong>, and choose{" "}
										<strong>Map network drive…</strong>
									</li>
									<li>
										Choose a drive letter (e.g. <strong>N:</strong>).
									</li>
									<li>
										In the <strong>Folder</strong> field paste your WebDAV URL:
									</li>
								</ol>
								{conn.webdavUrl && (
									<CopyField label="WebDAV URL" value={conn.webdavUrl} />
								)}
								<ol
									className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed"
									start={4}
								>
									<li>
										Check <strong>Reconnect at sign-in</strong>.
									</li>
									<li>
										Click <strong>Finish</strong> — enter your portal email and
										password when prompted.
									</li>
								</ol>
								<p className="text-xs text-muted-foreground bg-muted rounded px-3 py-2">
									<strong>Tip:</strong> If Windows shows an error about HTTPS
									certificates, run this once in an Admin Command Prompt, then
									retry:{" "}
									<code className="font-mono">
										reg add
										HKLM\SYSTEM\CurrentControlSet\Services\WebClient\Parameters
										/v BasicAuthLevel /t REG_DWORD /d 2 /f
									</code>
								</p>
							</div>

							<Separator />

							{/* Option B — SFTP native drive via WinFsp + SSHFS-Win */}
							<div className="space-y-3">
								<p className="font-semibold text-foreground">
									Option B — SFTP mapped drive (WinFsp + SSHFS-Win, free)
								</p>
								<ol className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed">
									<li>
										Install{" "}
										<strong>
											<a
												href="https://winfsp.dev/rel/"
												target="_blank"
												rel="noopener noreferrer"
												className="underline"
											>
												WinFsp
											</a>
										</strong>{" "}
										then{" "}
										<strong>
											<a
												href="https://github.com/winfsp/sshfs-win#installation"
												target="_blank"
												rel="noopener noreferrer"
												className="underline"
											>
												SSHFS-Win
											</a>
										</strong>
										.
									</li>
									<li>
										Open <strong>File Explorer → Map network drive…</strong>,
										choose a drive letter, and paste this UNC path:
									</li>
								</ol>
								{conn.sftpEndpoint && conn.userEmail && (
									<CopyField
										label="SSHFS UNC path"
										value={`\\\\sshfs\\${conn.userEmail}@${conn.sftpEndpoint}!22`}
									/>
								)}
								<ol
									className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed"
									start={3}
								>
									<li>
										Check <strong>Reconnect at sign-in</strong> → click{" "}
										<strong>Finish</strong>.
									</li>
									<li>
										Enter your portal password when prompted. Your company
										folders appear at drive root.
									</li>
								</ol>
							</div>

							<Separator />

							{/* Option C — Mountain Duck */}
							<div className="space-y-2">
								<p className="font-semibold text-foreground">
									Option C — Mountain Duck (paid, seamless)
								</p>
								<p className="text-muted-foreground">
									<a
										href="https://mountainduck.io"
										target="_blank"
										rel="noopener noreferrer"
										className="underline"
									>
										Mountain Duck
									</a>{" "}
									mounts SFTP as a native drive with offline sync. New Bookmark
									→ <strong>SFTP</strong> → paste host{" "}
									<code className="font-mono text-xs">{conn.sftpEndpoint}</code>
									, port <strong>22</strong>, username = your email, password
									authentication.
								</p>
							</div>
						</TabsContent>

						{/* ── macOS ─────────────────────────────────────────────── */}
						<TabsContent value="macos" className="space-y-6 text-sm">
							{/* Option A — Finder WebDAV */}
							<div className="space-y-3">
								<p className="font-semibold text-foreground">
									Option A — WebDAV via Finder (built-in, no extra software)
								</p>
								<ol className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed">
									<li>
										In Finder, press <kbd>⌘K</kbd> (or go to{" "}
										<strong>Go → Connect to Server…</strong>).
									</li>
									<li>Paste your WebDAV URL:</li>
								</ol>
								{conn.webdavUrl && (
									<CopyField label="WebDAV URL" value={conn.webdavUrl} />
								)}
								<ol
									className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed"
									start={3}
								>
									<li>
										Click <strong>Connect</strong> → choose{" "}
										<strong>Registered User</strong> → enter your portal email
										and password.
									</li>
									<li>
										The share mounts under <strong>/Volumes/dav</strong> and
										appears in the Finder sidebar.
									</li>
								</ol>
							</div>

							<Separator />

							{/* Option B — SSHFS via Homebrew */}
							<div className="space-y-3">
								<p className="font-semibold text-foreground">
									Option B — SFTP mount via SSHFS (Homebrew, free)
								</p>
								<ol className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed">
									<li>
										Install dependencies (one-time):{" "}
										<code className="font-mono text-xs bg-muted px-1 rounded">
											brew install macfuse sshfs
										</code>
									</li>
									<li>Create a local mount point and mount:</li>
								</ol>
								{conn.sftpEndpoint && conn.userEmail && (
									<CopyField
										label="Terminal mount command"
										value={`mkdir -p ~/NavaraDrive && sshfs ${conn.userEmail}@${conn.sftpEndpoint}: ~/NavaraDrive -p 22`}
									/>
								)}
								<ol
									className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed"
									start={3}
								>
									<li>
										Enter your portal password. Your company folder appears at{" "}
										<code className="font-mono text-xs">~/NavaraDrive</code>.
									</li>
									<li>
										To unmount:{" "}
										<code className="font-mono text-xs bg-muted px-1 rounded">
											umount ~/NavaraDrive
										</code>
									</li>
								</ol>
							</div>

							<Separator />

							{/* Option C — Mountain Duck */}
							<div className="space-y-2">
								<p className="font-semibold text-foreground">
									Option C — Mountain Duck (paid, seamless)
								</p>
								<p className="text-muted-foreground">
									<a
										href="https://mountainduck.io"
										target="_blank"
										rel="noopener noreferrer"
										className="underline"
									>
										Mountain Duck
									</a>{" "}
									mounts SFTP as a Finder volume with offline sync. New Bookmark
									→ <strong>SFTP</strong> → paste host{" "}
									<code className="font-mono text-xs">{conn.sftpEndpoint}</code>
									, port <strong>22</strong>, username = your email.
								</p>
							</div>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>

			{/* ── SFTP connection details ─────────────────────────────────── */}
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
					{conn.companies.length > 0 && (
						<p className="text-xs text-muted-foreground">
							Accessible companies: {conn.companies.join(", ")}
						</p>
					)}

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

			{/* ── GUI client instructions ─────────────────────────────────── */}
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

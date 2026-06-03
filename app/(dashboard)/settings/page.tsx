"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2 } from "lucide-react";

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

type UserAccessResponse = {
	targetUser?: {
		grants?: Array<{ companyId: string; canWrite: boolean }>;
	};
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
	const queryClient = useQueryClient();

	const [newCompanyId, setNewCompanyId] = useState("");
	const [selectedCompanyId, setSelectedCompanyId] = useState("");
	const [userSearch, setUserSearch] = useState("");
	const [selectedUserEmail, setSelectedUserEmail] = useState("");
	const [permissionDraft, setPermissionDraft] = useState<{
		hasAccess: boolean;
		canWrite: boolean;
	} | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const { data: connection = null } = useQuery<ConnectionInfo>({
		queryKey: ["connection-info"],
		queryFn: () => requestJson<ConnectionInfo>("/api/settings/connection-info"),
	});

	const { data: companyAccess = null } = useQuery<CompanyAccessResponse>({
		queryKey: ["company-access"],
		queryFn: () =>
			requestJson<CompanyAccessResponse>("/api/settings/company-access"),
	});

	const { data: usersPayload = null } = useQuery<CognitoUsersResponse>({
		queryKey: ["company-access-users"],
		enabled: Boolean(connection?.isSuperAdmin),
		queryFn: () =>
			requestJson<CognitoUsersResponse>("/api/settings/company-access/users"),
	});

	const { data: selectedUserAccess, isFetching: loadingUserAccess } = useQuery<
		UserAccessResponse,
		Error
	>({
		queryKey: ["company-access-target", selectedUserEmail],
		enabled: Boolean(selectedUserEmail.trim()),
		queryFn: () =>
			requestJson<UserAccessResponse>(
				`/api/settings/company-access?userEmail=${encodeURIComponent(selectedUserEmail)}`,
			),
	});

	const createCompanyMutation = useMutation({
		mutationFn: async (companyId: string) => {
			return requestJson<{ companyId?: string }>(
				"/api/settings/company-access",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "createCompany", companyId }),
				},
			);
		},
		onSuccess: async (payload, companyId) => {
			const createdCompany = payload.companyId ?? companyId;
			setSelectedCompanyId(createdCompany);
			setNewCompanyId("");
			setStatus(`Created company ${createdCompany}.`);
			setErrorMessage(null);
			await queryClient.invalidateQueries({ queryKey: ["company-access"] });
			await queryClient.invalidateQueries({ queryKey: ["connection-info"] });
		},
		onError: (mutationError) => {
			setStatus(null);
			setErrorMessage(
				mutationError instanceof Error
					? mutationError.message
					: "Failed to create company.",
			);
		},
	});

	const saveUserAccessMutation = useMutation({
		mutationFn: async (
			grants: Array<{ companyId: string; canWrite: boolean }>,
		) => {
			return requestJson<{
				grants?: Array<{ companyId: string; canWrite: boolean }>;
			}>("/api/settings/company-access", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "setUserAccess",
					userEmail: selectedUserEmail.trim().toLowerCase(),
					grants,
				}),
			});
		},
		onSuccess: async () => {
			setStatus("Permissions updated.");
			setErrorMessage(null);
			await queryClient.invalidateQueries({ queryKey: ["company-access"] });
			await queryClient.invalidateQueries({ queryKey: ["connection-info"] });
			await queryClient.invalidateQueries({
				queryKey: ["company-access-target", selectedUserEmail],
			});
		},
		onError: (mutationError) => {
			setStatus(null);
			setErrorMessage(
				mutationError instanceof Error
					? mutationError.message
					: "Failed to save user access.",
			);
		},
	});

	const allCompanies = companyAccess?.allCompanies ?? [];
	const activeCompanyId = selectedCompanyId || allCompanies[0] || "";
	const selectedGrant = useMemo(() => {
		const grants = selectedUserAccess?.targetUser?.grants ?? [];
		return grants.find((item) => item.companyId === activeCompanyId) ?? null;
	}, [selectedUserAccess, activeCompanyId]);
	const selectedUserHasAccess =
		permissionDraft?.hasAccess ?? Boolean(selectedGrant);
	const selectedUserCanWrite =
		permissionDraft?.canWrite ?? selectedGrant?.canWrite !== false;

	const filteredUsers = useMemo(() => {
		const users = usersPayload?.users ?? [];
		const search = userSearch.trim().toLowerCase();
		if (!search) return users;
		return users.filter((user) => {
			return (
				user.email.toLowerCase().includes(search) ||
				user.username.toLowerCase().includes(search)
			);
		});
	}, [usersPayload?.users, userSearch]);

	async function savePermission() {
		if (!selectedUserEmail.trim() || !activeCompanyId) return;
		const currentGrants = selectedUserAccess?.targetUser?.grants ?? [];
		const nextGrants = currentGrants.filter(
			(grant) => grant.companyId !== activeCompanyId,
		);
		if (selectedUserHasAccess) {
			nextGrants.push({
				companyId: activeCompanyId,
				canWrite: selectedUserCanWrite,
			});
		}
		await saveUserAccessMutation.mutateAsync(nextGrants);
	}

	const isAdminWorking =
		createCompanyMutation.isPending || saveUserAccessMutation.isPending;

	function onCompanyChange(companyId: string) {
		setSelectedCompanyId(companyId);
		setPermissionDraft(null);
	}

	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h1 className="text-xl font-semibold text-balance">Settings</h1>
				<p className="text-xs text-muted-foreground">
					Connection details and company access controls.
				</p>
			</div>

			{connection?.isSuperAdmin ? (
				<Card>
					<CardHeader>
						<CardTitle>Company Access</CardTitle>
						<CardDescription>
							Create companies and manage user permissions by company.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="grid gap-3 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="new-company" className="text-xs">
									Create Company
								</Label>
								<div className="flex gap-2">
									<Input
										id="new-company"
										name="companyId"
										placeholder="acme-corp"
										autoComplete="off"
										value={newCompanyId}
										onChange={(event) => setNewCompanyId(event.target.value)}
									/>
									<Button
										size="sm"
										onClick={() =>
											void createCompanyMutation.mutateAsync(
												newCompanyId.trim(),
											)
										}
										disabled={
											!newCompanyId.trim() || createCompanyMutation.isPending
										}
									>
										{createCompanyMutation.isPending ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											"Create"
										)}
									</Button>
								</div>
							</div>
							<div className="space-y-2">
								<Label htmlFor="company-select" className="text-xs">
									Manage Company
								</Label>
								<Select
									value={activeCompanyId}
									onValueChange={onCompanyChange}
									disabled={allCompanies.length === 0}
								>
									<SelectTrigger id="company-select">
										<SelectValue placeholder="Select a company" />
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
						</div>

						<div className="space-y-2">
							<Label htmlFor="user-search" className="text-xs">
								Search Users
							</Label>
							<Input
								id="user-search"
								name="userSearch"
								type="search"
								placeholder="email or username"
								value={userSearch}
								onChange={(event) => setUserSearch(event.target.value)}
							/>
						</div>

						<div className="rounded-md border">
							<div className="max-h-64 overflow-y-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="h-8 text-xs">User</TableHead>
											<TableHead className="h-8 text-xs">Status</TableHead>
											<TableHead className="h-8 text-right text-xs">
												Action
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{filteredUsers.length === 0 ? (
											<TableRow>
												<TableCell
													colSpan={3}
													className="py-3 text-xs text-muted-foreground"
												>
													No matching users.
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
														<TableCell className="py-2">
															<div className="font-medium">{user.email}</div>
															<div className="text-xs text-muted-foreground">
																{user.username}
															</div>
														</TableCell>
														<TableCell className="py-2">
															<Badge
																variant={user.enabled ? "success" : "warning"}
															>
																{user.enabled ? user.status : "DISABLED"}
															</Badge>
														</TableCell>
														<TableCell className="py-2 text-right">
															<Button
																size="sm"
																variant={isSelected ? "default" : "outline"}
																onClick={() => {
																	setStatus(null);
																	setErrorMessage(null);
																	setSelectedUserEmail(user.email);
																	setPermissionDraft(null);
																}}
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

						{selectedUserEmail && activeCompanyId ? (
							<div className="space-y-2 rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									Managing{" "}
									<span className="font-medium text-foreground">
										{selectedUserEmail}
									</span>{" "}
									for{" "}
									<span className="font-medium text-foreground">
										{activeCompanyId}
									</span>
									.
								</p>
								<div className="flex flex-wrap items-center gap-3">
									<div className="flex items-center gap-2">
										<Switch
											checked={selectedUserHasAccess}
											onCheckedChange={(checked) => {
												setPermissionDraft((current) => {
													const baseCanWrite =
														current?.canWrite ??
														selectedGrant?.canWrite !== false;
													return {
														hasAccess: checked,
														canWrite: checked ? baseCanWrite : false,
													};
												});
											}}
										/>
										<Label>Company Access</Label>
									</div>
									<div className="flex items-center gap-2">
										<Switch
											checked={selectedUserCanWrite}
											onCheckedChange={(checked) => {
												setPermissionDraft((current) => ({
													hasAccess:
														current?.hasAccess ?? Boolean(selectedGrant),
													canWrite: checked,
												}));
											}}
											disabled={!selectedUserHasAccess}
										/>
										<Label>Write Access</Label>
									</div>
									<Button
										size="sm"
										onClick={() => void savePermission()}
										disabled={isAdminWorking || loadingUserAccess}
									>
										{saveUserAccessMutation.isPending ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											"Save Permission"
										)}
									</Button>
								</div>
							</div>
						) : null}

						{status ? (
							<p className="text-xs text-muted-foreground">{status}</p>
						) : null}
						{errorMessage ? (
							<p className="text-xs text-destructive">{errorMessage}</p>
						) : null}
					</CardContent>
				</Card>
			) : null}

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

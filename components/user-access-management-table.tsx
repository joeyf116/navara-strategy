"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type CompanyGrant = {
	companyId: string;
	canWrite: boolean;
};

type CompanyAccessResponse = {
	allCompanies: string[];
};

type CognitoUsersResponse = {
	users: Array<{
		username: string;
		email: string;
		enabled: boolean;
		status: string;
		grants?: CompanyGrant[];
	}>;
};

const EMPTY_USERS: CognitoUsersResponse["users"] = [];

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

function grantsToDraft(
	grants: CompanyGrant[] | undefined,
): Record<string, CompanyGrant> {
	const draft: Record<string, CompanyGrant> = {};
	for (const grant of grants ?? []) {
		draft[grant.companyId] = {
			companyId: grant.companyId,
			canWrite: grant.canWrite !== false,
		};
	}
	return draft;
}

export function UserAccessManagementTable() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const [editingEmail, setEditingEmail] = useState<string | null>(null);
	const [grantDraft, setGrantDraft] = useState<Record<string, CompanyGrant>>(
		{},
	);

	const [selectedUserEmails, setSelectedUserEmails] = useState<string[]>([]);
	const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
	const [bulkGrantDraft, setBulkGrantDraft] = useState<
		Record<string, CompanyGrant>
	>({});

	const { data: companyAccess = null } = useQuery<CompanyAccessResponse>({
		queryKey: ["company-access"],
		queryFn: () =>
			requestJson<CompanyAccessResponse>("/api/settings/company-access"),
	});

	const { data: usersPayload = null, isFetching: usersLoading } =
		useQuery<CognitoUsersResponse>({
			queryKey: ["company-access-users"],
			queryFn: () =>
				requestJson<CognitoUsersResponse>("/api/settings/company-access/users"),
		});

	const saveUserAccessMutation = useMutation({
		mutationFn: async () => {
			if (!editingEmail) throw new Error("No user selected.");
			const grants = Object.values(grantDraft);
			return requestJson<{ grants: CompanyGrant[] }>(
				"/api/settings/company-access",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "setUserAccess",
						userEmail: editingEmail,
						grants,
					}),
				},
			);
		},
		onSuccess: async () => {
			setStatus("User access updated.");
			setErrorMessage(null);
			setEditingEmail(null);
			setGrantDraft({});
			await queryClient.invalidateQueries({ queryKey: ["company-access"] });
			await queryClient.invalidateQueries({
				queryKey: ["company-access-users"],
			});
			await queryClient.invalidateQueries({ queryKey: ["connection-info"] });
		},
		onError: (error) => {
			setStatus(null);
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Failed to update user access.",
			);
		},
	});

	const saveBulkAccessMutation = useMutation({
		mutationFn: async () => {
			if (selectedUserEmails.length === 0) {
				throw new Error("Select at least one user.");
			}
			return requestJson<{ updatedUsers: Array<{ userEmail: string }> }>(
				"/api/settings/company-access",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "setBulkUserAccess",
						userEmails: selectedUserEmails,
						grants: Object.values(bulkGrantDraft),
					}),
				},
			);
		},
		onSuccess: async (payload) => {
			setStatus(
				`Updated access for ${payload.updatedUsers.length} user${payload.updatedUsers.length === 1 ? "" : "s"}.`,
			);
			setErrorMessage(null);
			setBulkDialogOpen(false);
			setSelectedUserEmails([]);
			setBulkGrantDraft({});
			await queryClient.invalidateQueries({ queryKey: ["company-access"] });
			await queryClient.invalidateQueries({
				queryKey: ["company-access-users"],
			});
			await queryClient.invalidateQueries({ queryKey: ["connection-info"] });
		},
		onError: (error) => {
			setStatus(null);
			setErrorMessage(
				error instanceof Error ? error.message : "Failed to apply bulk access.",
			);
		},
	});

	const allCompanies = companyAccess?.allCompanies ?? [];
	const users = usersPayload?.users ?? EMPTY_USERS;

	const filteredUsers = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return users;
		return users.filter((user) => {
			return (
				user.email.toLowerCase().includes(query) ||
				user.username.toLowerCase().includes(query)
			);
		});
	}, [users, search]);

	const editingUser =
		editingEmail === null
			? null
			: (users.find((user) => user.email === editingEmail) ?? null);

	const allFilteredSelected =
		filteredUsers.length > 0 &&
		filteredUsers.every((user) => selectedUserEmails.includes(user.email));
	const someFilteredSelected =
		filteredUsers.some((user) => selectedUserEmails.includes(user.email)) &&
		!allFilteredSelected;

	function startEdit(email: string) {
		const user = users.find((item) => item.email === email);
		if (!user) return;
		setEditingEmail(user.email);
		setGrantDraft(grantsToDraft(user.grants));
		setStatus(null);
		setErrorMessage(null);
	}

	function toggleSelectedUser(email: string, checked: boolean) {
		setSelectedUserEmails((current) => {
			if (checked)
				return current.includes(email) ? current : [...current, email];
			return current.filter((item) => item !== email);
		});
	}

	function toggleSelectAllFiltered(checked: boolean) {
		const filtered = filteredUsers.map((user) => user.email);
		setSelectedUserEmails((current) => {
			if (!checked) return current.filter((email) => !filtered.includes(email));
			return [...new Set([...current, ...filtered])];
		});
	}

	function toggleCompany(
		companyId: string,
		checked: boolean,
		target: "single" | "bulk",
	) {
		const setDraft = target === "single" ? setGrantDraft : setBulkGrantDraft;
		setDraft((current) => {
			if (!checked) {
				const next = { ...current };
				delete next[companyId];
				return next;
			}
			return {
				...current,
				[companyId]: {
					companyId,
					canWrite: current[companyId]?.canWrite ?? true,
				},
			};
		});
	}

	function setCanWrite(
		companyId: string,
		canWrite: boolean,
		target: "single" | "bulk",
	) {
		const setDraft = target === "single" ? setGrantDraft : setBulkGrantDraft;
		setDraft((current) => {
			const grant = current[companyId];
			if (!grant) return current;
			return {
				...current,
				[companyId]: {
					...grant,
					canWrite,
				},
			};
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>User Access Management</CardTitle>
				<CardDescription>
					Manage assigned companies for each user account.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex flex-wrap items-end justify-between gap-2">
					<div className="w-full max-w-sm space-y-1.5">
						<Label htmlFor="user-access-search" className="text-xs">
							Search Users
						</Label>
						<Input
							id="user-access-search"
							name="userAccessSearch"
							type="search"
							placeholder="email or username"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</div>
					<Button
						size="sm"
						onClick={() => {
							setBulkGrantDraft({});
							setBulkDialogOpen(true);
						}}
						disabled={selectedUserEmails.length === 0}
					>
						<Users className="mr-2 h-4 w-4" aria-hidden="true" />
						Bulk Update Access ({selectedUserEmails.length})
					</Button>
				</div>

				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10">
									<Checkbox
										checked={
											allFilteredSelected
												? true
												: someFilteredSelected
													? "indeterminate"
													: false
										}
										onCheckedChange={(checked) =>
											toggleSelectAllFiltered(checked === true)
										}
										aria-label="Select all filtered users"
									/>
								</TableHead>
								<TableHead>User Name/Email</TableHead>
								<TableHead>Assigned Companies</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{usersLoading ? (
								<TableRow>
									<TableCell colSpan={4} className="py-6 text-center">
										<Loader2
											className="mx-auto h-5 w-5 animate-spin text-muted-foreground"
											aria-hidden="true"
										/>
									</TableCell>
								</TableRow>
							) : filteredUsers.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={4}
										className="py-3 text-xs text-muted-foreground"
									>
										No matching users.
									</TableCell>
								</TableRow>
							) : (
								filteredUsers.map((user) => {
									const grants = user.grants ?? [];
									const selected = selectedUserEmails.includes(user.email);
									return (
										<TableRow
											key={user.username}
											className={selected ? "bg-accent/30" : ""}
										>
											<TableCell>
												<Checkbox
													checked={selected}
													onCheckedChange={(checked) =>
														toggleSelectedUser(user.email, checked === true)
													}
													aria-label={`Select ${user.email}`}
												/>
											</TableCell>
											<TableCell>
												<p className="font-medium">{user.email}</p>
												<p className="text-xs text-muted-foreground">
													{user.username}
												</p>
											</TableCell>
											<TableCell>
												{grants.length === 0 ? (
													<span className="text-xs text-muted-foreground">
														None
													</span>
												) : (
													<div className="flex flex-wrap gap-1">
														{grants.map((grant) => (
															<Badge
																key={`${user.email}:${grant.companyId}`}
																variant={grant.canWrite ? "success" : "outline"}
															>
																{grant.companyId}
															</Badge>
														))}
													</div>
												)}
											</TableCell>
											<TableCell className="text-right">
												<Button
													variant="outline"
													size="sm"
													onClick={() => startEdit(user.email)}
												>
													Edit Access
												</Button>
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>

				{status ? (
					<p className="text-xs text-muted-foreground">{status}</p>
				) : null}
				{errorMessage ? (
					<p className="text-xs text-destructive">{errorMessage}</p>
				) : null}
			</CardContent>

			<Dialog
				open={Boolean(editingEmail)}
				onOpenChange={(open) => {
					if (!open) {
						setEditingEmail(null);
						setGrantDraft({});
					}
				}}
			>
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>Edit Company Access</DialogTitle>
						<DialogDescription>
							{editingUser?.email ?? "Selected user"}
						</DialogDescription>
					</DialogHeader>

					<div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
						{allCompanies.length === 0 ? (
							<p className="text-xs text-muted-foreground">
								No companies available yet.
							</p>
						) : (
							allCompanies.map((companyId) => {
								const grant = grantDraft[companyId];
								const checked = Boolean(grant);
								return (
									<div key={companyId} className="rounded border px-3 py-2">
										<div className="flex items-center justify-between gap-2">
											<label className="flex items-center gap-2 text-sm font-medium">
												<Checkbox
													checked={checked}
													onCheckedChange={(value) =>
														toggleCompany(companyId, value === true, "single")
													}
												/>
												{companyId}
											</label>
											<div className="flex items-center gap-2 text-xs">
												<Switch
													checked={grant?.canWrite ?? false}
													onCheckedChange={(canWrite) =>
														setCanWrite(companyId, canWrite, "single")
													}
													disabled={!checked}
												/>
												<span className="text-muted-foreground">Write</span>
											</div>
										</div>
									</div>
								);
							})
						)}
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setEditingEmail(null);
								setGrantDraft({});
							}}
							disabled={saveUserAccessMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => void saveUserAccessMutation.mutateAsync()}
							disabled={saveUserAccessMutation.isPending || !editingEmail}
						>
							{saveUserAccessMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
							) : (
								"Save Access"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={bulkDialogOpen}
				onOpenChange={(open) => {
					setBulkDialogOpen(open);
					if (!open) {
						setBulkGrantDraft({});
					}
				}}
			>
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>Bulk Update User Access</DialogTitle>
						<DialogDescription>
							Apply company grants to {selectedUserEmails.length} selected user
							{selectedUserEmails.length === 1 ? "" : "s"}. Existing grants will
							be replaced.
						</DialogDescription>
					</DialogHeader>

					<div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
						{allCompanies.length === 0 ? (
							<p className="text-xs text-muted-foreground">
								No companies available yet.
							</p>
						) : (
							allCompanies.map((companyId) => {
								const grant = bulkGrantDraft[companyId];
								const checked = Boolean(grant);
								return (
									<div key={companyId} className="rounded border px-3 py-2">
										<div className="flex items-center justify-between gap-2">
											<label className="flex items-center gap-2 text-sm font-medium">
												<Checkbox
													checked={checked}
													onCheckedChange={(value) =>
														toggleCompany(companyId, value === true, "bulk")
													}
												/>
												{companyId}
											</label>
											<div className="flex items-center gap-2 text-xs">
												<Switch
													checked={grant?.canWrite ?? false}
													onCheckedChange={(canWrite) =>
														setCanWrite(companyId, canWrite, "bulk")
													}
													disabled={!checked}
												/>
												<span className="text-muted-foreground">Write</span>
											</div>
										</div>
									</div>
								);
							})
						)}
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setBulkDialogOpen(false);
								setBulkGrantDraft({});
							}}
							disabled={saveBulkAccessMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => void saveBulkAccessMutation.mutateAsync()}
							disabled={
								saveBulkAccessMutation.isPending ||
								selectedUserEmails.length === 0
							}
						>
							{saveBulkAccessMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
							) : (
								"Apply to Selected Users"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}

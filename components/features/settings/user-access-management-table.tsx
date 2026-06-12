"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Building2,
	MoreHorizontal,
	Plus,
	Search,
	Trash2,
	UserPlus,
	Users,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { TableSkeletonRows } from "@/components/shared/table-skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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

type ManagedUser = {
	username: string;
	email: string;
	name: string | null;
	enabled: boolean;
	status: string;
	createdAt: string | null;
	updatedAt: string | null;
	grants?: CompanyGrant[];
};

type CompanyAccessResponse = {
	allCompanies: string[];
};

type CognitoUsersResponse = {
	users: ManagedUser[];
};

type UserStatusFilter = "all" | "active" | "pending" | "disabled";

const EMPTY_USERS: ManagedUser[] = [];

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

function getInitials(name: string | null | undefined, email: string): string {
	const source = (name?.trim() || email).trim();
	return source
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function formatTimestamp(value: string | null): string {
	if (!value) return "-";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "-";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(parsed);
}

function getUserStatus(user: ManagedUser): Exclude<UserStatusFilter, "all"> {
	if (!user.enabled) return "disabled";
	const normalized = user.status.trim().toUpperCase();
	if (
		normalized === "FORCE_CHANGE_PASSWORD" ||
		normalized === "RESET_REQUIRED" ||
		normalized === "UNCONFIRMED"
	) {
		return "pending";
	}
	return "active";
}

function statusLabel(user: ManagedUser): string {
	switch (getUserStatus(user)) {
		case "active":
			return "Active";
		case "pending":
			return user.status.trim().toUpperCase() === "FORCE_CHANGE_PASSWORD"
				? "Temp Password"
				: "Pending";
		case "disabled":
			return "Disabled";
	}
}

function statusVariant(user: ManagedUser) {
	switch (getUserStatus(user)) {
		case "active":
			return "success" as const;
		case "pending":
			return "warning" as const;
		case "disabled":
			return "outline" as const;
	}
}

function generateTemporaryPassword(): string {
	const token = Math.random().toString(36).slice(2, 8).toUpperCase();
	return `Navara!${token}9`;
}

export function UserAccessManagementTable() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");

	const [editingEmail, setEditingEmail] = useState<string | null>(null);
	const [grantDraft, setGrantDraft] = useState<Record<string, CompanyGrant>>(
		{},
	);
	const [editCompanySearch, setEditCompanySearch] = useState("");

	const [selectedUserEmails, setSelectedUserEmails] = useState<string[]>([]);
	const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
	const [bulkGrantDraft, setBulkGrantDraft] = useState<
		Record<string, CompanyGrant>
	>({});
	const [bulkCompanySearch, setBulkCompanySearch] = useState("");

	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [createCompanySearch, setCreateCompanySearch] = useState("");
	const [createName, setCreateName] = useState("");
	const [createEmail, setCreateEmail] = useState("");
	const [createTemporaryPassword, setCreateTemporaryPassword] = useState(
		generateTemporaryPassword(),
	);
	const [createGrantDraft, setCreateGrantDraft] = useState<
		Record<string, CompanyGrant>
	>({});

	const [deleteEmail, setDeleteEmail] = useState<string | null>(null);

	const { data: companyAccess = null } = useQuery<CompanyAccessResponse>({
		queryKey: ["company-access"],
		queryFn: () => requestJson("/api/settings/company-access"),
	});

	const {
		data: usersPayload = null,
		isLoading: usersLoading,
		isError: usersError,
		refetch: refetchUsers,
	} = useQuery<CognitoUsersResponse>({
		queryKey: ["company-access-users"],
		queryFn: () => requestJson("/api/settings/company-access/users"),
	});

	async function invalidateQueries() {
		await queryClient.invalidateQueries({ queryKey: ["company-access"] });
		await queryClient.invalidateQueries({ queryKey: ["company-access-users"] });
		await queryClient.invalidateQueries({ queryKey: ["connection-info"] });
	}

	const saveUserAccessMutation = useMutation({
		mutationFn: async () => {
			if (!editingEmail) throw new Error("No user selected.");
			return requestJson("/api/settings/company-access", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "setUserAccess",
					userEmail: editingEmail,
					grants: Object.values(grantDraft),
				}),
			});
		},
		onSuccess: async () => {
			toast.success("Company access updated.");
			setEditingEmail(null);
			setGrantDraft({});
			await invalidateQueries();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to update access.",
			);
		},
	});

	const saveBulkAccessMutation = useMutation({
		mutationFn: async () => {
			if (selectedUserEmails.length === 0) {
				throw new Error("Select at least one user.");
			}
			return requestJson("/api/settings/company-access", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "setBulkUserAccess",
					userEmails: selectedUserEmails,
					grants: Object.values(bulkGrantDraft),
				}),
			});
		},
		onSuccess: async () => {
			toast.success(
				`Updated access for ${selectedUserEmails.length} user${selectedUserEmails.length === 1 ? "" : "s"}.`,
			);
			setBulkDialogOpen(false);
			setSelectedUserEmails([]);
			setBulkGrantDraft({});
			await invalidateQueries();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to apply bulk access.",
			);
		},
	});

	const createUserMutation = useMutation({
		mutationFn: async () =>
			requestJson<{ user: ManagedUser }>("/api/settings/company-access/users", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: createName,
					email: createEmail,
					temporaryPassword: createTemporaryPassword,
					grants: Object.values(createGrantDraft),
				}),
			}),
		onSuccess: async ({ user }) => {
			toast.success(`Created ${user.email}`, {
				description:
					"Share the temporary password securely. Cognito will force a reset on first login.",
			});
			setCreateDialogOpen(false);
			setCreateName("");
			setCreateEmail("");
			setCreateTemporaryPassword(generateTemporaryPassword());
			setCreateGrantDraft({});
			await invalidateQueries();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create user.",
			);
		},
	});

	const deleteUserMutation = useMutation({
		mutationFn: async () => {
			if (!deleteEmail) throw new Error("No user selected.");
			return requestJson("/api/settings/company-access/users", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: deleteEmail }),
			});
		},
		onSuccess: async () => {
			toast.success(`Removed ${deleteEmail}.`);
			setDeleteEmail(null);
			await invalidateQueries();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove user.",
			);
		},
	});

	const allCompanies = companyAccess?.allCompanies ?? [];
	const users = usersPayload?.users ?? EMPTY_USERS;

	const filteredUsers = useMemo(() => {
		const query = search.trim().toLowerCase();
		return users.filter((user) => {
			const matchesSearch =
				!query ||
				user.email.toLowerCase().includes(query) ||
				user.username.toLowerCase().includes(query) ||
				(user.name ?? "").toLowerCase().includes(query);
			const matchesStatus =
				statusFilter === "all" || getUserStatus(user) === statusFilter;
			return matchesSearch && matchesStatus;
		});
	}, [users, search, statusFilter]);

	const editingUser = editingEmail
		? (users.find((user) => user.email === editingEmail) ?? null)
		: null;

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
		setEditCompanySearch("");
	}

	function openCreateDialog() {
		setCreateName("");
		setCreateEmail("");
		setCreateTemporaryPassword(generateTemporaryPassword());
		setCreateGrantDraft({});
		setCreateCompanySearch("");
		setCreateDialogOpen(true);
	}

	function toggleSelectedUser(email: string, checked: boolean) {
		setSelectedUserEmails((current) => {
			if (checked) {
				return current.includes(email) ? current : [...current, email];
			}
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
		target: "single" | "bulk" | "create",
	) {
		const setDraft =
			target === "single"
				? setGrantDraft
				: target === "bulk"
					? setBulkGrantDraft
					: setCreateGrantDraft;

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
		target: "single" | "bulk" | "create",
	) {
		const setDraft =
			target === "single"
				? setGrantDraft
				: target === "bulk"
					? setBulkGrantDraft
					: setCreateGrantDraft;

		setDraft((current) => {
			const grant = current[companyId];
			if (!grant) return current;
			return {
				...current,
				[companyId]: { ...grant, canWrite },
			};
		});
	}

	function renderCompanyEditor(
		draft: Record<string, CompanyGrant>,
		target: "single" | "bulk" | "create",
		search: string,
	) {
		if (allCompanies.length === 0) {
			return (
				<p className="text-sm text-muted-foreground">
					No companies available yet.
				</p>
			);
		}

		const query = search.trim().toLowerCase();
		const visibleCompanies = query
			? allCompanies.filter((id) => id.toLowerCase().includes(query))
			: allCompanies;

		if (visibleCompanies.length === 0) {
			return (
				<p className="text-sm text-muted-foreground">
					No companies match your search.
				</p>
			);
		}

		return visibleCompanies.map((companyId) => {
			const grant = draft[companyId];
			const checked = Boolean(grant);
			return (
				<div
					key={`${target}:${companyId}`}
					className="rounded-lg border border-border bg-muted/20 px-3 py-2"
				>
					<div className="flex items-center justify-between gap-3">
						<label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
							<Checkbox
								checked={checked}
								onCheckedChange={(value) =>
									toggleCompany(companyId, value === true, target)
								}
							/>
							<span className="inline-flex items-center gap-2">
								<Building2 className="h-4 w-4 text-muted-foreground" />
								{companyId}
							</span>
						</label>
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<span>Write</span>
							<Switch
								checked={grant?.canWrite ?? false}
								onCheckedChange={(value) =>
									setCanWrite(companyId, value, target)
								}
								disabled={!checked}
							/>
						</div>
					</div>
				</div>
			);
		});
	}

	return (
		<>
			<div className="space-y-4">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex flex-1 flex-col gap-3 sm:flex-row">
						<div className="relative flex-1">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								id="user-management-search"
								type="search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search users by name or email"
								className="pl-9"
							/>
						</div>
						<Select
							value={statusFilter}
							onValueChange={(value) =>
								setStatusFilter(value as UserStatusFilter)
							}
							items={{
								all: "All statuses",
								active: "Active",
								pending: "Temp password",
								disabled: "Disabled",
							}}
						>
							<SelectTrigger className="w-full sm:w-44">
								<SelectValue placeholder="All statuses" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="all">All statuses</SelectItem>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="pending">Temp password</SelectItem>
									<SelectItem value="disabled">Disabled</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setBulkGrantDraft({});
								setBulkCompanySearch("");
								setBulkDialogOpen(true);
							}}
							disabled={selectedUserEmails.length === 0}
						>
							<Users data-icon="inline-start" aria-hidden="true" />
							Bulk access ({selectedUserEmails.length})
						</Button>
						<Button size="sm" onClick={openCreateDialog}>
							<Plus data-icon="inline-start" aria-hidden="true" />
							Add user
						</Button>
					</div>
				</div>

				<div className="overflow-hidden rounded-lg border border-border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10">
									<Checkbox
										checked={allFilteredSelected}
										indeterminate={!allFilteredSelected && someFilteredSelected}
										onCheckedChange={(checked) =>
											toggleSelectAllFiltered(checked === true)
										}
										aria-label="Select all filtered users"
									/>
								</TableHead>
								<TableHead>User</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Company access</TableHead>
								<TableHead>Updated</TableHead>
								<TableHead className="w-14 text-right">
									<span className="sr-only">Actions</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{usersLoading ? (
								<TableSkeletonRows rows={5} columns={6} />
							) : usersError ? (
								<TableRow>
									<TableCell colSpan={6} className="p-4">
										<ErrorState
											title="Unable to load users"
											description="Something went wrong while loading the user list. Try again."
											onRetry={() => void refetchUsers()}
										/>
									</TableCell>
								</TableRow>
							) : users.length === 0 ? (
								<TableRow>
									<TableCell colSpan={6}>
										<EmptyState
											icon={UserPlus}
											title="No users yet"
											description="Create the first user to grant portal and SFTP access."
											action={
												<Button size="sm" onClick={openCreateDialog}>
													<Plus data-icon="inline-start" aria-hidden="true" />
													Add user
												</Button>
											}
										/>
									</TableCell>
								</TableRow>
							) : filteredUsers.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={6}
										className="py-10 text-center text-sm text-muted-foreground"
									>
										No users match the current filters.
									</TableCell>
								</TableRow>
							) : (
								filteredUsers.map((user) => {
									const grants = user.grants ?? [];
									const selected = selectedUserEmails.includes(user.email);
									const displayName = user.name?.trim() || user.email;
									return (
										<TableRow
											key={user.username}
											className={selected ? "bg-accent/20" : undefined}
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
												<div className="flex items-center gap-3">
													<Avatar className="h-8 w-8">
														<AvatarFallback>
															{getInitials(user.name, user.email)}
														</AvatarFallback>
													</Avatar>
													<div className="min-w-0 space-y-0.5">
														<p className="truncate font-medium text-foreground">
															{displayName}
														</p>
														<p className="truncate text-xs text-muted-foreground">
															{user.email}
														</p>
													</div>
												</div>
											</TableCell>
											<TableCell>
												<Badge variant={statusVariant(user)}>
													{statusLabel(user)}
												</Badge>
											</TableCell>
											<TableCell>
												{grants.length === 0 ? (
													<span className="text-sm text-muted-foreground">
														No access
													</span>
												) : (
													<div className="flex flex-wrap items-center gap-1">
														{grants.slice(0, 3).map((grant) => (
															<Badge
																key={`${user.email}:${grant.companyId}`}
																variant={grant.canWrite ? "success" : "outline"}
																className="max-w-30 truncate text-xs"
																title={`${grant.companyId} — ${grant.canWrite ? "Read/Write" : "Read only"}`}
															>
																{grant.companyId}
															</Badge>
														))}
														{grants.length > 3 ? (
															<Badge
																variant="secondary"
																className="text-xs"
																title={grants
																	.slice(3)
																	.map((g) => g.companyId)
																	.join(", ")}
															>
																+{grants.length - 3} more
															</Badge>
														) : null}
													</div>
												)}
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												{formatTimestamp(user.updatedAt ?? user.createdAt)}
											</TableCell>
											<TableCell className="text-right">
												<DropdownMenu>
													<DropdownMenuTrigger
														className={buttonVariants({
															variant: "ghost",
															size: "icon",
														})}
														aria-label={`Actions for ${user.email}`}
													>
														<MoreHorizontal
															className="size-4"
															aria-hidden="true"
														/>
													</DropdownMenuTrigger>
													<DropdownMenuContent
														align="end"
														className="w-full whitespace-nowrap"
													>
														<DropdownMenuItem
															onClick={() => startEdit(user.email)}
														>
															<Building2 aria-hidden="true" />
															Edit company access
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() => setDeleteEmail(user.email)}
														>
															<Trash2 aria-hidden="true" />
															Remove user
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>

				<div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
					<p>
						Showing {filteredUsers.length} of {users.length} user
						{users.length === 1 ? "" : "s"}
					</p>
					<p>
						New users are created in Cognito with a temporary password you set.
					</p>
				</div>
			</div>

			{/* Edit company access dialog */}
			<Dialog
				open={Boolean(editingEmail)}
				onOpenChange={(open) => {
					if (!open) {
						setEditingEmail(null);
						setGrantDraft({});
						setEditCompanySearch("");
					}
				}}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Edit company access</DialogTitle>
						<DialogDescription>
							{editingUser?.email ?? "Selected user"}
						</DialogDescription>
					</DialogHeader>
					<div className="relative">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							type="search"
							value={editCompanySearch}
							onChange={(e) => setEditCompanySearch(e.target.value)}
							placeholder="Search companies..."
							className="pl-9"
						/>
					</div>
					<div className="max-h-80 space-y-2 overflow-y-auto pr-1">
						{renderCompanyEditor(grantDraft, "single", editCompanySearch)}
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
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							Save access
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Bulk access dialog */}
			<Dialog
				open={bulkDialogOpen}
				onOpenChange={(open) => {
					setBulkDialogOpen(open);
					if (!open) {
						setBulkGrantDraft({});
						setBulkCompanySearch("");
					}
				}}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Bulk update company access</DialogTitle>
						<DialogDescription>
							Apply the same grants to {selectedUserEmails.length} selected user
							{selectedUserEmails.length === 1 ? "" : "s"}. Existing grants will
							be replaced.
						</DialogDescription>
					</DialogHeader>
					<div className="relative">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							type="search"
							value={bulkCompanySearch}
							onChange={(e) => setBulkCompanySearch(e.target.value)}
							placeholder="Search companies..."
							className="pl-9"
						/>
					</div>
					<div className="max-h-80 space-y-2 overflow-y-auto pr-1">
						{renderCompanyEditor(bulkGrantDraft, "bulk", bulkCompanySearch)}
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
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							Apply to selected users
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Create user dialog */}
			<Dialog
				open={createDialogOpen}
				onOpenChange={(open) => {
					setCreateDialogOpen(open);
					if (!open) setCreateGrantDraft({});
				}}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Create user</DialogTitle>
						<DialogDescription>
							Creates the user in Cognito with a temporary password and optional
							company access.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="create-user-name">Full name</Label>
								<Input
									id="create-user-name"
									value={createName}
									onChange={(event) => setCreateName(event.target.value)}
									placeholder="Jane Doe"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="create-user-email">Email</Label>
								<Input
									id="create-user-email"
									type="email"
									value={createEmail}
									onChange={(event) => setCreateEmail(event.target.value)}
									placeholder="jane@company.com"
									required
								/>
							</div>
						</div>
						<div className="space-y-2">
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor="create-user-temp-password">
									Temporary password
								</Label>
								<Button
									variant="outline"
									size="sm"
									type="button"
									onClick={() =>
										setCreateTemporaryPassword(generateTemporaryPassword())
									}
								>
									Generate
								</Button>
							</div>
							<Input
								id="create-user-temp-password"
								type="text"
								value={createTemporaryPassword}
								onChange={(event) =>
									setCreateTemporaryPassword(event.target.value)
								}
								required
							/>
							<p className="text-sm text-muted-foreground">
								Cognito will require a permanent password reset on first
								sign-in.
							</p>
						</div>
						<div className="space-y-2">
							<div>
								<p className="text-sm font-medium">Initial company access</p>
								<p className="text-sm text-muted-foreground">
									Optional. You can also assign access later from the row
									actions.
								</p>
							</div>
							<div className="relative">
								<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									type="search"
									value={createCompanySearch}
									onChange={(e) => setCreateCompanySearch(e.target.value)}
									placeholder="Search companies..."
									className="pl-9"
								/>
							</div>
							<div className="max-h-56 space-y-2 overflow-y-auto pr-1">
								{renderCompanyEditor(
									createGrantDraft,
									"create",
									createCompanySearch,
								)}
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setCreateDialogOpen(false)}
							disabled={createUserMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => void createUserMutation.mutateAsync()}
							disabled={
								createUserMutation.isPending ||
								!createEmail.trim() ||
								!createTemporaryPassword.trim()
							}
						>
							{createUserMutation.isPending ? (
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							Create user
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete user confirmation — AlertDialog for destructive action */}
			<AlertDialog
				open={Boolean(deleteEmail)}
				onOpenChange={(open) => !open && setDeleteEmail(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove user?</AlertDialogTitle>
						<AlertDialogDescription>
							This deletes the Cognito user and clears all stored company-access
							metadata for{" "}
							<span className="font-medium text-foreground">
								{deleteEmail ?? "the selected user"}
							</span>
							. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteUserMutation.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => void deleteUserMutation.mutateAsync()}
							disabled={deleteUserMutation.isPending || !deleteEmail}
						>
							{deleteUserMutation.isPending ? (
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							Remove user
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

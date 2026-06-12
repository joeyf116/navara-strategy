"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

type CognitoUsersResponse = {
	users: Array<{
		username: string;
		email: string;
		enabled: boolean;
		status: string;
	}>;
};

type CreateCompanyResponse = {
	companyId?: string;
	assignedUsers?: string[];
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

export function CreateCompanyDialog({
	disabled = false,
	onCreated,
}: {
	disabled?: boolean;
	onCreated?: (message: string) => void;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [companyName, setCompanyName] = useState("");
	const [search, setSearch] = useState("");
	const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const { data: usersPayload = null, isFetching: usersLoading } =
		useQuery<CognitoUsersResponse>({
			queryKey: ["company-access-users"],
			enabled: open,
			queryFn: () =>
				requestJson<CognitoUsersResponse>("/api/settings/company-access/users"),
		});

	const createCompanyMutation = useMutation({
		mutationFn: async () => {
			return requestJson<CreateCompanyResponse>(
				"/api/settings/company-access",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "createCompany",
						companyId: companyName.trim(),
						grantUserEmails: selectedUsers,
					}),
				},
			);
		},
		onSuccess: async (payload) => {
			const createdCompany = payload.companyId ?? companyName.trim();
			const assignedCount =
				payload.assignedUsers?.length ?? selectedUsers.length;
			setCompanyName("");
			setSelectedUsers([]);
			setSearch("");
			setErrorMessage(null);
			setOpen(false);
			await queryClient.invalidateQueries({ queryKey: ["company-access"] });
			await queryClient.invalidateQueries({ queryKey: ["connection-info"] });
			await queryClient.invalidateQueries({
				queryKey: ["company-access-users"],
			});
			onCreated?.(
				assignedCount > 0
					? `Created company ${createdCompany} and granted ${assignedCount} user${assignedCount === 1 ? "" : "s"}.`
					: `Created company ${createdCompany}.`,
			);
		},
		onError: (error) => {
			setErrorMessage(
				error instanceof Error ? error.message : "Failed to create company.",
			);
		},
	});

	const filteredUsers = useMemo(() => {
		const users = usersPayload?.users ?? [];
		const query = search.trim().toLowerCase();
		if (!query) return users;
		return users.filter((user) => {
			return (
				user.email.toLowerCase().includes(query) ||
				user.username.toLowerCase().includes(query)
			);
		});
	}, [usersPayload?.users, search]);

	function toggleUser(email: string) {
		setSelectedUsers((current) =>
			current.includes(email)
				? current.filter((item) => item !== email)
				: [...current, email],
		);
	}

	return (
		<>
			<Button
				variant="outline"
				onClick={() => setOpen(true)}
				disabled={disabled}
			>
				<Plus data-icon="inline-start" aria-hidden="true" />
				Create company
			</Button>

			<Dialog
				open={open}
				onOpenChange={(nextOpen) => {
					setOpen(nextOpen);
					if (!nextOpen) {
						setErrorMessage(null);
					}
				}}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Create Company</DialogTitle>
						<DialogDescription>
							Create a company and optionally grant user access.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="company-name">Company name</Label>
							<Input
								id="company-name"
								name="companyName"
								placeholder="acme-corp"
								autoComplete="off"
								value={companyName}
								onChange={(event) => setCompanyName(event.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor="grant-user-search">Grant user access</Label>
								<Badge variant="outline">{selectedUsers.length} selected</Badge>
							</div>
							<Input
								id="grant-user-search"
								name="grantUserSearch"
								type="search"
								placeholder="Search users by email or username"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
							/>
							<div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
								{usersLoading ? (
									<p className="px-2 py-1 text-sm text-muted-foreground">
										Loading users...
									</p>
								) : filteredUsers.length === 0 ? (
									<p className="px-2 py-1 text-sm text-muted-foreground">
										No matching users.
									</p>
								) : (
									filteredUsers.map((user) => {
										const checked = selectedUsers.includes(user.email);
										return (
											<label
												key={user.username}
												className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 hover:bg-accent"
											>
												<div className="min-w-0">
													<p className="truncate text-sm font-medium">
														{user.email}
													</p>
													<p className="truncate text-xs text-muted-foreground">
														{user.username}
													</p>
												</div>
												<Checkbox
													checked={checked}
													onCheckedChange={() => toggleUser(user.email)}
													aria-label={`Grant access to ${user.email}`}
												/>
											</label>
										);
									})
								)}
							</div>
						</div>

						{errorMessage ? (
							<Alert variant="destructive">
								<AlertDescription>{errorMessage}</AlertDescription>
							</Alert>
						) : null}
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={createCompanyMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => void createCompanyMutation.mutateAsync()}
							disabled={!companyName.trim() || createCompanyMutation.isPending}
						>
							{createCompanyMutation.isPending ? (
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							Create company
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

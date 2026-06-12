"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { TableSkeletonRows } from "@/components/shared/table-skeleton";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type AppPasswordRecord = {
	id: string;
	label: string;
	tokenPrefix: string;
	createdAt: string;
	lastUsedAt: string | null;
};

type ListResponse = { passwords: AppPasswordRecord[] };
type CreateResponse = { id: string; token: string; tokenPrefix: string };

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

function formatDate(value: string | null): string {
	if (!value) return "Never";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "–";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
}

function TokenReveal({ token }: { token: string }) {
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	function copyToken() {
		void navigator.clipboard.writeText(token).then(() => {
			setCopied(true);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => setCopied(false), 2000);
		});
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
				<code className="flex-1 break-all font-mono text-sm">{token}</code>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 shrink-0"
					onClick={copyToken}
					aria-label="Copy token"
				>
					{copied ? (
						<Check className="h-4 w-4 text-green-600" aria-hidden="true" />
					) : (
						<Copy className="h-4 w-4" aria-hidden="true" />
					)}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">
				Copy this now — it will not be shown again. Use it as the password when
				connecting your network drive.
			</p>
		</div>
	);
}

export function AppPasswordsPanel() {
	const queryClient = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [newLabel, setNewLabel] = useState("");
	const [createdToken, setCreatedToken] = useState<string | null>(null);
	const [revokeId, setRevokeId] = useState<string | null>(null);

	const { data, isLoading } = useQuery<ListResponse>({
		queryKey: ["app-passwords"],
		queryFn: () => requestJson<ListResponse>("/api/settings/app-passwords"),
	});

	const passwords = data?.passwords ?? [];

	const createMutation = useMutation({
		mutationFn: () =>
			requestJson<CreateResponse>("/api/settings/app-passwords", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ label: newLabel.trim() }),
			}),
		onSuccess: (result) => {
			setCreatedToken(result.token);
			setNewLabel("");
			void queryClient.invalidateQueries({ queryKey: ["app-passwords"] });
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create password.",
			);
		},
	});

	const revokeMutation = useMutation({
		mutationFn: () =>
			requestJson("/api/settings/app-passwords", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: revokeId }),
			}),
		onSuccess: async () => {
			toast.success("App password revoked.");
			setRevokeId(null);
			await queryClient.invalidateQueries({ queryKey: ["app-passwords"] });
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to revoke password.",
			);
		},
	});

	function openCreate() {
		setNewLabel("");
		setCreatedToken(null);
		setCreateOpen(true);
	}

	function closeCreate() {
		setCreateOpen(false);
		setCreatedToken(null);
		setNewLabel("");
	}

	return (
		<>
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					App passwords allow desktop clients and network drives to authenticate
					without your main Cognito password. Each password is shown only once.
				</p>
				<Button size="sm" onClick={openCreate} className="shrink-0">
					<Plus data-icon="inline-start" aria-hidden="true" />
					New app password
				</Button>
			</div>

			<div className="overflow-hidden rounded-lg border border-border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>
								<span className="flex items-center gap-2">
									<KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
									Label
								</span>
							</TableHead>
							<TableHead>Prefix</TableHead>
							<TableHead>Created</TableHead>
							<TableHead>Last used</TableHead>
							<TableHead className="w-14">
								<span className="sr-only">Revoke</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableSkeletonRows rows={2} columns={5} />
						) : passwords.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={5}
									className="py-8 text-center text-sm text-muted-foreground"
								>
									No app passwords yet. Create one to start connecting your
									network drive.
								</TableCell>
							</TableRow>
						) : (
							passwords.map((pw) => (
								<TableRow key={pw.id}>
									<TableCell className="font-medium">{pw.label}</TableCell>
									<TableCell>
										<Badge variant="outline" className="font-mono text-xs">
											{pw.tokenPrefix}…
										</Badge>
									</TableCell>
									<TableCell className="text-sm text-muted-foreground">
										{formatDate(pw.createdAt)}
									</TableCell>
									<TableCell className="text-sm text-muted-foreground">
										{formatDate(pw.lastUsedAt)}
									</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 text-muted-foreground hover:text-destructive"
											aria-label={`Revoke ${pw.label}`}
											onClick={() => setRevokeId(pw.id)}
										>
											<Trash2 className="h-4 w-4" aria-hidden="true" />
										</Button>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Create dialog */}
			<Dialog open={createOpen} onOpenChange={(open) => !open && closeCreate()}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>New app password</DialogTitle>
						<DialogDescription>
							Give this password a name so you can identify it later (e.g.
							&ldquo;Work laptop&rdquo; or &ldquo;Home PC&rdquo;).
						</DialogDescription>
					</DialogHeader>

					{createdToken ? (
						<>
							<div className="space-y-1">
								<p className="text-sm font-medium text-green-700 dark:text-green-400">
									Password created successfully
								</p>
								<TokenReveal token={createdToken} />
							</div>
							<DialogFooter>
								<Button onClick={closeCreate}>Done</Button>
							</DialogFooter>
						</>
					) : (
						<>
							<div className="space-y-2">
								<Label htmlFor="app-password-label">Name</Label>
								<Input
									id="app-password-label"
									placeholder="e.g. Work laptop"
									value={newLabel}
									onChange={(e) => setNewLabel(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && newLabel.trim()) {
											void createMutation.mutateAsync();
										}
									}}
									autoFocus
								/>
							</div>
							<DialogFooter>
								<Button
									variant="outline"
									onClick={closeCreate}
									disabled={createMutation.isPending}
								>
									Cancel
								</Button>
								<Button
									onClick={() => void createMutation.mutateAsync()}
									disabled={createMutation.isPending || !newLabel.trim()}
								>
									{createMutation.isPending ? (
										<Spinner data-icon="inline-start" aria-hidden="true" />
									) : null}
									Create password
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>

			{/* Revoke confirmation */}
			<AlertDialog
				open={Boolean(revokeId)}
				onOpenChange={(open) => !open && setRevokeId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Revoke app password?</AlertDialogTitle>
						<AlertDialogDescription>
							Any client using this password will immediately lose access. This
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={revokeMutation.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => void revokeMutation.mutateAsync()}
							disabled={revokeMutation.isPending}
						>
							{revokeMutation.isPending ? (
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							Revoke
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

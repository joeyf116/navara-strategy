"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronRight,
	FileText,
	Folder,
	FolderPlus,
	Loader2,
	MoreHorizontal,
	RefreshCw,
	Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type Entry = {
	id: string;
	name: string;
	kind: "file" | "folder";
	ownerEmail: string;
	sizeBytes: number;
	updatedAt: string;
	canWrite: boolean;
	virtualPath: string;
};

type DialogState =
	| { type: "closed" }
	| { type: "newFolder" }
	| { type: "rename"; entry: Entry }
	| { type: "delete"; entry: Entry };

function formatSize(bytes: number) {
	if (bytes === 0) return "-";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatModified(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

async function parseJson<T>(response: Response): Promise<T> {
	return (await response.json().catch(() => ({}))) as T;
}

export function FileManagerConsole() {
	const queryClient = useQueryClient();
	const [currentPath, setCurrentPath] = useState("/");
	const [status, setStatus] = useState<{
		message: string;
		error?: boolean;
	} | null>(null);
	const [uploadProgress, setUploadProgress] = useState<number | null>(null);
	const [dialog, setDialog] = useState<DialogState>({ type: "closed" });
	const [folderName, setFolderName] = useState("");
	const [renameName, setRenameName] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const {
		data: entries = [],
		isFetching,
		error: loadError,
	} = useQuery<Entry[]>({
		queryKey: ["files-tree", currentPath],
		queryFn: async () => {
			const response = await fetch(
				`/api/files/tree?path=${encodeURIComponent(currentPath)}`,
			);
			const payload = await parseJson<{ entries?: Entry[]; error?: string }>(
				response,
			);
			if (!response.ok)
				throw new Error(payload.error ?? "Failed to load files.");
			return payload.entries ?? [];
		},
	});

	const refreshMutation = useMutation({
		mutationFn: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPath],
			});
		},
	});

	const createFolderMutation = useMutation({
		mutationFn: async (name: string) => {
			const response = await fetch("/api/files/tree", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "createFolder",
					path: currentPath,
					name,
				}),
			});
			const payload = await parseJson<{ error?: string }>(response);
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to create folder.");
			}
		},
		onSuccess: async (_, name) => {
			setStatus({ message: `Created folder ${name}.` });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPath],
			});
			setDialog({ type: "closed" });
		},
		onError: (error) => {
			setStatus({
				message:
					error instanceof Error ? error.message : "Failed to create folder.",
				error: true,
			});
		},
	});

	const renameMutation = useMutation({
		mutationFn: async (payload: { id: string; name: string }) => {
			const response = await fetch("/api/files/tree", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const body = await parseJson<{ error?: string }>(response);
			if (!response.ok) throw new Error(body.error ?? "Rename failed.");
		},
		onSuccess: async () => {
			setStatus({ message: "Item renamed." });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPath],
			});
			setDialog({ type: "closed" });
		},
		onError: (error) => {
			setStatus({
				message: error instanceof Error ? error.message : "Rename failed.",
				error: true,
			});
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const response = await fetch(
				`/api/files/tree?id=${encodeURIComponent(id)}`,
				{ method: "DELETE" },
			);
			const body = await parseJson<{ error?: string }>(response);
			if (!response.ok) throw new Error(body.error ?? "Delete failed.");
		},
		onSuccess: async () => {
			setStatus({ message: "Item deleted." });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPath],
			});
			setDialog({ type: "closed" });
		},
		onError: (error) => {
			setStatus({
				message: error instanceof Error ? error.message : "Delete failed.",
				error: true,
			});
		},
	});

	const uploadMutation = useMutation({
		mutationFn: async (file: File) => {
			await new Promise<void>((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.open("POST", "/api/files/tree");

				xhr.upload.onprogress = (event) => {
					if (!event.lengthComputable) return;
					setUploadProgress(Math.round((event.loaded / event.total) * 100));
				};

				xhr.onload = () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						resolve();
						return;
					}
					reject(new Error("Upload failed."));
				};

				xhr.onerror = () => reject(new Error("Upload failed."));

				const formData = new FormData();
				formData.append("path", currentPath);
				formData.append("file", file);
				xhr.send(formData);
			});
		},
		onSuccess: async () => {
			setStatus({ message: "Upload complete." });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPath],
			});
		},
		onError: (error) => {
			setStatus({
				message: error instanceof Error ? error.message : "Upload failed.",
				error: true,
			});
		},
		onSettled: () => {
			setUploadProgress(null);
		},
	});

	const activeStatus =
		status ??
		(loadError
			? {
					message:
						loadError instanceof Error
							? loadError.message
							: "Failed to load files.",
					error: true,
				}
			: null);

	const isDialogWorking =
		createFolderMutation.isPending ||
		renameMutation.isPending ||
		deleteMutation.isPending;

	const breadcrumbs = useMemo(() => {
		const segments = currentPath.split("/").filter(Boolean);
		const parts = [{ label: "Root", path: "/" }];
		for (let i = 0; i < segments.length; i++) {
			parts.push({
				label: segments[i],
				path: `/${segments.slice(0, i + 1).join("/")}`,
			});
		}
		return parts;
	}, [currentPath]);

	function navigate(path: string) {
		setStatus(null);
		setCurrentPath(path);
	}

	function closeDialog() {
		setDialog({ type: "closed" });
	}

	return (
		<>
			<div className="space-y-3">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div>
						<h1 className="text-xl font-semibold text-balance">Files</h1>
						<p className="text-xs text-muted-foreground">
							Browse company folders and manage file operations.
						</p>
					</div>
					<div className="flex items-center gap-1.5">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setDialog({ type: "newFolder" })}
							className="h-8 px-2.5"
						>
							<FolderPlus className="mr-2 h-4 w-4" aria-hidden="true" />
							New Folder
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void refreshMutation.mutateAsync()}
							disabled={refreshMutation.isPending}
							className="h-8 px-2.5"
						>
							<RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
							Refresh
						</Button>
						<Button
							size="sm"
							onClick={() => fileInputRef.current?.click()}
							disabled={uploadMutation.isPending}
							className="h-8 px-2.5"
						>
							<Upload className="mr-2 h-4 w-4" aria-hidden="true" />
							Upload
						</Button>
						<input
							ref={fileInputRef}
							type="file"
							className="hidden"
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) {
									void uploadMutation.mutateAsync(file);
								}
								event.currentTarget.value = "";
							}}
						/>
					</div>
				</div>

				<Card>
					<CardHeader className="space-y-2 pb-1">
						<CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Path
						</CardTitle>
						<nav className="flex flex-wrap items-center gap-1 text-xs">
							{breadcrumbs.map((crumb, index) => (
								<span key={crumb.path} className="flex items-center gap-1">
									{index > 0 && (
										<ChevronRight
											className="h-3.5 w-3.5 text-muted-foreground"
											aria-hidden="true"
										/>
									)}
									<button
										type="button"
										onClick={() => navigate(crumb.path)}
										className={
											index === breadcrumbs.length - 1
												? "font-medium text-foreground"
												: "text-muted-foreground hover:text-foreground"
										}
									>
										{crumb.label}
									</button>
								</span>
							))}
						</nav>
						{uploadProgress !== null && (
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground">
									Uploading… {uploadProgress}%
								</p>
								<div className="h-1.5 w-full rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary transition-[width]"
										style={{ width: `${uploadProgress}%` }}
									/>
								</div>
							</div>
						)}
						{activeStatus && (
							<p
								className={`text-xs ${activeStatus.error ? "text-destructive" : "text-muted-foreground"}`}
							>
								{activeStatus.message}
							</p>
						)}
					</CardHeader>
					<CardContent className="px-0 pb-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="h-8 pl-5 text-xs">Name</TableHead>
									<TableHead className="hidden h-8 text-xs md:table-cell">
										Owner
									</TableHead>
									<TableHead className="hidden sm:table-cell">
										Modified
									</TableHead>
									<TableHead className="hidden h-8 text-xs sm:table-cell">
										Size
									</TableHead>
									<TableHead className="h-8 w-10 pr-3" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{isFetching ? (
									<TableRow>
										<TableCell colSpan={5} className="py-6 text-center">
											<Loader2
												className="mx-auto h-5 w-5 animate-spin text-muted-foreground"
												aria-hidden="true"
											/>
										</TableCell>
									</TableRow>
								) : entries.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={5}
											className="py-6 text-center text-xs text-muted-foreground"
										>
											No items in this folder.
										</TableCell>
									</TableRow>
								) : (
									entries.map((entry) => (
										<TableRow key={entry.id}>
											<TableCell className="py-2 pl-5">
												<button
													type="button"
													className="flex min-w-0 items-center gap-2 text-left font-medium hover:underline"
													onClick={() => {
														if (entry.kind === "folder")
															navigate(entry.virtualPath);
													}}
													disabled={entry.kind !== "folder"}
												>
													{entry.kind === "folder" ? (
														<Folder
															className="h-4 w-4 shrink-0 text-amber-500"
															aria-hidden="true"
														/>
													) : (
														<FileText
															className="h-4 w-4 shrink-0 text-muted-foreground"
															aria-hidden="true"
														/>
													)}
													<span className="truncate">{entry.name}</span>
												</button>
											</TableCell>
											<TableCell className="hidden py-2 text-xs text-muted-foreground md:table-cell">
												{entry.ownerEmail}
											</TableCell>
											<TableCell className="hidden py-2 text-xs text-muted-foreground sm:table-cell">
												{formatModified(entry.updatedAt)}
											</TableCell>
											<TableCell className="hidden py-2 text-xs text-muted-foreground sm:table-cell">
												{entry.kind === "file"
													? formatSize(entry.sizeBytes)
													: "-"}
											</TableCell>
											<TableCell className="py-2 pr-3">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="outline"
															size="sm"
															className="h-6 w-6 p-0"
															aria-label={`Actions for ${entry.name}`}
														>
															<MoreHorizontal
																className="h-4 w-4"
																aria-hidden="true"
															/>
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														{entry.kind === "file" && (
															<DropdownMenuItem
																onClick={() => {
																	window.location.href = `/api/files/tree/download/${entry.id}`;
																}}
															>
																Download
															</DropdownMenuItem>
														)}
														{entry.kind === "file" && <DropdownMenuSeparator />}
														<DropdownMenuItem
															onClick={() => {
																setRenameName(entry.name);
																setDialog({ type: "rename", entry });
															}}
															disabled={!entry.canWrite}
														>
															Rename
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															className="text-destructive focus:text-destructive"
															onClick={() =>
																setDialog({ type: "delete", entry })
															}
															disabled={!entry.canWrite}
														>
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</div>

			<Dialog
				open={dialog.type === "newFolder"}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>New Folder</DialogTitle>
						<DialogDescription>
							Create a folder in {currentPath}.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor="folder-name">Folder Name</Label>
						<Input
							id="folder-name"
							name="folderName"
							placeholder="new-folder"
							autoComplete="off"
							value={folderName}
							onChange={(event) => setFolderName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									const name = folderName.trim();
									if (name) {
										void createFolderMutation.mutateAsync(name);
									}
								}
							}}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={closeDialog}
							disabled={isDialogWorking}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								const name = folderName.trim();
								if (name) {
									void createFolderMutation.mutateAsync(name);
								}
							}}
							disabled={!folderName.trim() || isDialogWorking}
						>
							{createFolderMutation.isPending && (
								<Loader2
									className="mr-2 h-4 w-4 animate-spin"
									aria-hidden="true"
								/>
							)}
							Create
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={dialog.type === "rename"}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rename</DialogTitle>
						<DialogDescription>
							Choose a new name for{" "}
							{dialog.type === "rename" ? dialog.entry.name : "this item"}.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor="rename-name">New Name</Label>
						<Input
							id="rename-name"
							name="renameName"
							autoComplete="off"
							value={renameName}
							onChange={(event) => setRenameName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && dialog.type === "rename") {
									const name = renameName.trim();
									if (name && name !== dialog.entry.name) {
										void renameMutation.mutateAsync({
											id: dialog.entry.id,
											name,
										});
									}
								}
							}}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={closeDialog}
							disabled={isDialogWorking}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (dialog.type !== "rename") return;
								const name = renameName.trim();
								if (name && name !== dialog.entry.name) {
									void renameMutation.mutateAsync({
										id: dialog.entry.id,
										name,
									});
								}
							}}
							disabled={
								dialog.type !== "rename" ||
								!renameName.trim() ||
								(dialog.type === "rename" &&
									renameName.trim() === dialog.entry.name) ||
								isDialogWorking
							}
						>
							{renameMutation.isPending && (
								<Loader2
									className="mr-2 h-4 w-4 animate-spin"
									aria-hidden="true"
								/>
							)}
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={dialog.type === "delete"}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Item</DialogTitle>
						<DialogDescription>
							This will permanently remove{" "}
							{dialog.type === "delete" ? dialog.entry.name : "this item"}.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={closeDialog}
							disabled={isDialogWorking}
						>
							Cancel
						</Button>
						<Button
							variant="outline"
							className="text-destructive hover:text-destructive"
							onClick={() => {
								if (dialog.type === "delete") {
									void deleteMutation.mutateAsync(dialog.entry.id);
								}
							}}
							disabled={dialog.type !== "delete" || isDialogWorking}
						>
							{deleteMutation.isPending && (
								<Loader2
									className="mr-2 h-4 w-4 animate-spin"
									aria-hidden="true"
								/>
							)}
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Folder,
	FileText,
	MoreHorizontal,
	Upload,
	ChevronRight,
	FolderPlus,
	Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

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
	| { type: "delete"; entry: Entry }
	| { type: "share"; entry: Entry };

function formatSize(bytes: number) {
	if (bytes === 0) return "—";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

	// Dialog field state
	const [folderName, setFolderName] = useState("");
	const [renameName, setRenameName] = useState("");
	const [shareEmail, setShareEmail] = useState("");
	const [shareWrite, setShareWrite] = useState(false);
	const [dialogWorking, setDialogWorking] = useState(false);

	const fileInputRef = useRef<HTMLInputElement>(null);

	const {
		data: entries = [],
		isFetching: loading,
		error: loadError,
	} = useQuery<Entry[]>({
		queryKey: ["files-tree", currentPath],
		queryFn: async () => {
			const response = await fetch(
				`/api/files/tree?path=${encodeURIComponent(currentPath)}`,
			);
			const payload = (await response.json()) as {
				entries?: Entry[];
				error?: string;
			};
			if (!response.ok) throw new Error(payload.error ?? "Failed to load.");
			return payload.entries ?? [];
		},
	});

	function navigate(path: string) {
		setStatus(null);
		setCurrentPath(path);
	}

	async function refresh() {
		await queryClient.invalidateQueries({
			queryKey: ["files-tree", currentPath],
		});
	}

	// Surface query-level load errors into the status banner
	if (loadError && (!status || !status.error)) {
		setStatus({
			message:
				loadError instanceof Error ? loadError.message : "Failed to load.",
			error: true,
		});
	}

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

	function openNewFolder() {
		setFolderName("");
		setDialog({ type: "newFolder" });
	}

	function openRename(entry: Entry) {
		setRenameName(entry.name);
		setDialog({ type: "rename", entry });
	}

	function openDelete(entry: Entry) {
		setDialog({ type: "delete", entry });
	}

	function openShare(entry: Entry) {
		setShareEmail("");
		setShareWrite(false);
		setDialog({ type: "share", entry });
	}

	function closeDialog() {
		setDialog({ type: "closed" });
		setDialogWorking(false);
	}

	async function confirmCreateFolder() {
		const name = folderName.trim();
		if (!name) return;
		setDialogWorking(true);
		const response = await fetch("/api/files/tree", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "createFolder", path: currentPath, name }),
		});
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
		};
		setDialogWorking(false);
		if (!response.ok) {
			setStatus({
				message: payload.error ?? "Failed to create folder.",
				error: true,
			});
		} else {
			setStatus({ message: `Folder "${name}" created.` });
			await refresh();
		}
		closeDialog();
	}

	async function confirmRename() {
		if (dialog.type !== "rename") return;
		const name = renameName.trim();
		if (!name || name === dialog.entry.name) {
			closeDialog();
			return;
		}
		setDialogWorking(true);
		const response = await fetch("/api/files/tree", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: dialog.entry.id, name }),
		});
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
		};
		setDialogWorking(false);
		if (!response.ok) {
			setStatus({ message: payload.error ?? "Rename failed.", error: true });
		} else {
			await refresh();
		}
		closeDialog();
	}

	async function confirmDelete() {
		if (dialog.type !== "delete") return;
		setDialogWorking(true);
		const response = await fetch(
			`/api/files/tree?id=${encodeURIComponent(dialog.entry.id)}`,
			{ method: "DELETE" },
		);
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
		};
		setDialogWorking(false);
		if (!response.ok) {
			setStatus({ message: payload.error ?? "Delete failed.", error: true });
		} else {
			await refresh();
		}
		closeDialog();
	}

	async function confirmShare() {
		if (dialog.type !== "share") return;
		const email = shareEmail.trim().toLowerCase();
		if (!email) return;
		setDialogWorking(true);
		const response = await fetch("/api/files/tree", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "share",
				nodeId: dialog.entry.id,
				granteeEmail: email,
				canWrite: shareWrite,
			}),
		});
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
		};
		setDialogWorking(false);
		if (!response.ok) {
			setStatus({ message: payload.error ?? "Share failed.", error: true });
		} else {
			setStatus({ message: `Shared with ${email}.` });
		}
		closeDialog();
	}

	async function uploadFile(file: File) {
		await new Promise<void>((resolve) => {
			const xhr = new XMLHttpRequest();
			xhr.open("POST", "/api/files/tree");

			xhr.upload.onprogress = (event) => {
				if (!event.lengthComputable) return;
				setUploadProgress(Math.round((event.loaded / event.total) * 100));
			};

			xhr.onload = async () => {
				setUploadProgress(null);
				if (xhr.status >= 200 && xhr.status < 300) {
					await refresh();
				} else {
					setStatus({ message: "Upload failed.", error: true });
				}
				resolve();
			};

			xhr.onerror = () => {
				setUploadProgress(null);
				setStatus({ message: "Upload failed.", error: true });
				resolve();
			};

			const formData = new FormData();
			formData.append("path", currentPath);
			formData.append("file", file);
			xhr.send(formData);
		});
	}

	return (
		<>
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-bold">Files</h1>
					<p className="text-muted-foreground">
						Browse and manage your files. Changes sync to WebDAV automatically.
					</p>
				</div>

				<Card>
					<CardHeader className="pb-3">
						<div className="flex flex-wrap items-center justify-between gap-3">
							{/* Breadcrumb */}
							<nav className="flex flex-wrap items-center gap-1 text-sm">
								{breadcrumbs.map((crumb, i) => (
									<span key={crumb.path} className="flex items-center gap-1">
										{i > 0 && (
											<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
										)}
										<button
											onClick={() => navigate(crumb.path)}
											className={
												i === breadcrumbs.length - 1
													? "font-medium text-foreground"
													: "text-muted-foreground hover:text-foreground"
											}
										>
											{crumb.label}
										</button>
									</span>
								))}
							</nav>

							{/* Toolbar */}
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => navigate("/My Files")}
								>
									My Files
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => navigate("/Shared with Me")}
								>
									Shared with Me
								</Button>
								<Button variant="outline" size="sm" onClick={openNewFolder}>
									<FolderPlus className="mr-1.5 h-4 w-4" />
									New Folder
								</Button>
								<Button size="sm" onClick={() => fileInputRef.current?.click()}>
									<Upload className="mr-1.5 h-4 w-4" />
									Upload
								</Button>
								<input
									ref={fileInputRef}
									type="file"
									className="hidden"
									onChange={(event) => {
										const file = event.target.files?.[0];
										if (file) void uploadFile(file);
										event.currentTarget.value = "";
									}}
								/>
							</div>
						</div>

						{/* Upload progress */}
						{uploadProgress !== null && (
							<div className="mt-3 space-y-1">
								<p className="text-xs text-muted-foreground">
									Uploading… {uploadProgress}%
								</p>
								<div className="h-1.5 w-full rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary transition-all"
										style={{ width: `${uploadProgress}%` }}
									/>
								</div>
							</div>
						)}

						{/* Status message */}
						{status && (
							<p
								className={`mt-2 text-sm ${status.error ? "text-destructive" : "text-muted-foreground"}`}
							>
								{status.message}
							</p>
						)}
					</CardHeader>

					<CardContent className="px-0 pb-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="pl-6">Name</TableHead>
									<TableHead className="hidden md:table-cell">Owner</TableHead>
									<TableHead className="hidden sm:table-cell">
										Modified
									</TableHead>
									<TableHead className="hidden sm:table-cell">Size</TableHead>
									<TableHead className="w-12 pr-4" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell colSpan={5} className="py-12 text-center">
											<Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
										</TableCell>
									</TableRow>
								) : entries.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={5}
											className="py-12 text-center text-muted-foreground"
										>
											This folder is empty.
										</TableCell>
									</TableRow>
								) : (
									entries.map((entry) => (
										<TableRow key={entry.id} className="group">
											<TableCell className="pl-6">
												<button
													className="flex items-center gap-2 text-left font-medium hover:underline"
													onClick={() => {
														if (entry.kind === "folder") {
															navigate(entry.virtualPath);
														}
													}}
													disabled={entry.kind !== "folder"}
												>
													{entry.kind === "folder" ? (
														<Folder className="h-4 w-4 shrink-0 text-amber-500" />
													) : (
														<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
													)}
													<span className="truncate max-w-50">
														{entry.name}
													</span>
												</button>
											</TableCell>
											<TableCell className="hidden text-sm text-muted-foreground md:table-cell">
												{entry.ownerEmail}
											</TableCell>
											<TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
												{new Date(entry.updatedAt).toLocaleDateString(
													undefined,
													{
														month: "short",
														day: "numeric",
														year: "numeric",
													},
												)}
											</TableCell>
											<TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
												{entry.kind === "file"
													? formatSize(entry.sizeBytes)
													: "—"}
											</TableCell>
											<TableCell className="pr-4">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="outline"
															size="sm"
															className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
														>
															<MoreHorizontal className="h-4 w-4" />
															<span className="sr-only">Actions</span>
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
														<DropdownMenuItem onClick={() => openRename(entry)}>
															Rename
														</DropdownMenuItem>
														<DropdownMenuItem onClick={() => openShare(entry)}>
															Share…
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															className="text-destructive focus:text-destructive"
															onClick={() => openDelete(entry)}
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

			{/* New Folder Dialog */}
			<Dialog
				open={dialog.type === "newFolder"}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>New Folder</DialogTitle>
						<DialogDescription>
							Create a new folder in{" "}
							<span className="font-mono">{currentPath}</span>.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor="folder-name">Folder name</Label>
						<Input
							id="folder-name"
							placeholder="My Folder"
							value={folderName}
							onChange={(e) => setFolderName(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && void confirmCreateFolder()}
							autoFocus
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={closeDialog}
							disabled={dialogWorking}
						>
							Cancel
						</Button>
						<Button
							onClick={() => void confirmCreateFolder()}
							disabled={!folderName.trim() || dialogWorking}
						>
							{dialogWorking && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							)}
							Create
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Rename Dialog */}
			<Dialog
				open={dialog.type === "rename"}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rename</DialogTitle>
						<DialogDescription>
							Enter a new name for &ldquo;
							{dialog.type === "rename" ? dialog.entry.name : ""}&rdquo;.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor="rename-input">New name</Label>
						<Input
							id="rename-input"
							value={renameName}
							onChange={(e) => setRenameName(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && void confirmRename()}
							autoFocus
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={closeDialog}
							disabled={dialogWorking}
						>
							Cancel
						</Button>
						<Button
							onClick={() => void confirmRename()}
							disabled={!renameName.trim() || dialogWorking}
						>
							{dialogWorking && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							)}
							Rename
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog
				open={dialog.type === "delete"}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Delete &ldquo;{dialog.type === "delete" ? dialog.entry.name : ""}
							&rdquo;?
						</DialogTitle>
						<DialogDescription>
							{dialog.type === "delete" && dialog.entry.kind === "folder"
								? "This will permanently delete the folder and all its contents."
								: "This file will be permanently deleted."}{" "}
							This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={closeDialog}
							disabled={dialogWorking}
						>
							Cancel
						</Button>
						<Button
							variant="outline"
							className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
							onClick={() => void confirmDelete()}
							disabled={dialogWorking}
						>
							{dialogWorking && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							)}
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Share Dialog */}
			<Dialog
				open={dialog.type === "share"}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Share &ldquo;{dialog.type === "share" ? dialog.entry.name : ""}
							&rdquo;
						</DialogTitle>
						<DialogDescription>
							Grant another user access to this{" "}
							{dialog.type === "share" ? dialog.entry.kind : "item"}.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor="share-email">Email address</Label>
							<Input
								id="share-email"
								type="email"
								placeholder="colleague@company.com"
								value={shareEmail}
								onChange={(e) => setShareEmail(e.target.value)}
								autoFocus
							/>
						</div>
						<div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
							<div>
								<p className="text-sm font-medium">Allow editing</p>
								<p className="text-xs text-muted-foreground">
									Grants upload and delete permissions
								</p>
							</div>
							<Switch
								checked={shareWrite}
								onCheckedChange={setShareWrite}
								aria-label="Allow write access"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={closeDialog}
							disabled={dialogWorking}
						>
							Cancel
						</Button>
						<Button
							onClick={() => void confirmShare()}
							disabled={!shareEmail.trim() || dialogWorking}
						>
							{dialogWorking && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							)}
							Share
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

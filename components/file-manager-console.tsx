"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	ChevronRight,
	File,
	Folder,
	Loader2,
	MoreHorizontal,
	Plus,
	RefreshCw,
	Upload,
} from "lucide-react";

import { CreateCompanyDialog } from "@/components/create-company-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type ConnectionInfo = {
	isSuperAdmin: boolean;
};

type RowData =
	| {
			kind: "go-back";
			id: string;
			name: string;
			sizeBytes: number;
			updatedAt: string;
			entry: null;
	  }
	| {
			kind: "entry";
			id: string;
			name: string;
			sizeBytes: number;
			updatedAt: string;
			entry: Entry;
	  };

type DialogState =
	| { type: "closed" }
	| { type: "newFolder" }
	| { type: "upload" }
	| { type: "rename"; entry: Entry }
	| { type: "delete"; entry: Entry };

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function formatSize(bytes: number) {
	if (bytes === 0) return "-";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatModified(value: string) {
	if (!value) return "-";
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

function segmentsToPath(segments: string[]): string {
	if (segments.length === 0) return "/";
	return `/${segments.join("/")}`;
}

function displayPath(segments: string[]): string {
	if (segments.length === 0) return "/root/";
	return `/root/${segments.join("/")}/`;
}

export function FileManagerConsole() {
	// useReactTable returns functions that React Compiler cannot safely memoize.
	// "use no memo" explicitly opts this component out of compilation per React docs:
	// https://react.dev/reference/react-compiler/directives
	"use no memo";
	const queryClient = useQueryClient();
	const [currentPath, setCurrentPath] = useState<string[]>([]);
	const [status, setStatus] = useState<{
		message: string;
		error?: boolean;
	} | null>(null);
	const [uploadProgress, setUploadProgress] = useState<number | null>(null);
	const [dialog, setDialog] = useState<DialogState>({ type: "closed" });
	const [folderName, setFolderName] = useState("");
	const [renameName, setRenameName] = useState("");
	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const uploadInputRef = useRef<HTMLInputElement>(null);

	const currentPathString = useMemo(
		() => segmentsToPath(currentPath),
		[currentPath],
	);
	const destinationLabel = useMemo(
		() => displayPath(currentPath),
		[currentPath],
	);

	const {
		data: entries = [],
		isFetching,
		error: loadError,
	} = useQuery<Entry[]>({
		queryKey: ["files-tree", currentPathString],
		queryFn: async () => {
			const response = await fetch(
				`/api/files/tree?path=${encodeURIComponent(currentPathString)}`,
			);
			const payload = await parseJson<{ entries?: Entry[]; error?: string }>(
				response,
			);
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to load files.");
			}
			return payload.entries ?? [];
		},
	});

	const { data: connection = null } = useQuery<ConnectionInfo>({
		queryKey: ["connection-info"],
		queryFn: async () => {
			const response = await fetch("/api/settings/connection-info");
			const payload = await parseJson<ConnectionInfo & { error?: string }>(
				response,
			);
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to load connection info.");
			}
			return payload;
		},
	});

	const refreshMutation = useMutation({
		mutationFn: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPathString],
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
					path: currentPathString,
					name,
				}),
			});
			const payload = await parseJson<{ error?: string }>(response);
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to create folder.");
			}
		},
		onSuccess: async (_, name) => {
			setStatus({ message: `Created folder ${name} in ${destinationLabel}` });
			setFolderName("");
			setDialog({ type: "closed" });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPathString],
			});
		},
		onError: (error) => {
			setStatus({
				message:
					error instanceof Error ? error.message : "Failed to create folder.",
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
				formData.append("path", currentPathString);
				formData.append("file", file);
				xhr.send(formData);
			});
		},
		onSuccess: async () => {
			setStatus({ message: `Uploaded file to ${destinationLabel}` });
			setUploadFile(null);
			setDialog({ type: "closed" });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPathString],
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
			setDialog({ type: "closed" });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPathString],
			});
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
			setDialog({ type: "closed" });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPathString],
			});
		},
		onError: (error) => {
			setStatus({
				message: error instanceof Error ? error.message : "Delete failed.",
				error: true,
			});
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
		uploadMutation.isPending ||
		renameMutation.isPending ||
		deleteMutation.isPending;

	const breadcrumbItems = useMemo(() => {
		const items: Array<{ label: string; path: string[] }> = [
			{ label: "root", path: [] },
		];
		for (let i = 0; i < currentPath.length; i++) {
			items.push({
				label: currentPath[i],
				path: currentPath.slice(0, i + 1),
			});
		}
		return items;
	}, [currentPath]);

	const rows = useMemo<RowData[]>(() => {
		const data: RowData[] = entries.map((entry) => ({
			kind: "entry",
			id: entry.id,
			name: entry.name,
			sizeBytes: entry.sizeBytes,
			updatedAt: entry.updatedAt,
			entry,
		}));
		if (currentPath.length > 0) {
			data.unshift({
				kind: "go-back",
				id: "go-back",
				name: ".. / Go Back",
				sizeBytes: 0,
				updatedAt: "",
				entry: null,
			});
		}
		return data;
	}, [entries, currentPath.length]);

	function navigateToPath(path: string[]) {
		setStatus(null);
		setCurrentPath(path);
	}

	const columns = useMemo<ColumnDef<RowData>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Name",
				cell: ({ row }) => {
					const item = row.original;
					if (item.kind === "go-back") {
						return (
							<button
								type="button"
								onClick={() => navigateToPath(currentPath.slice(0, -1))}
								className="flex items-center gap-2 font-medium text-muted-foreground hover:text-foreground"
							>
								<ChevronRight
									className="h-4 w-4 rotate-180"
									aria-hidden="true"
								/>
								<span>{item.name}</span>
							</button>
						);
					}

					const entry = item.entry;
					if (!entry) return null;

					return (
						<button
							type="button"
							className="flex min-w-0 items-center gap-2 text-left font-medium hover:underline"
							onClick={() => {
								if (entry.kind === "folder") {
									navigateToPath([...currentPath, entry.name]);
								}
							}}
							disabled={entry.kind !== "folder"}
						>
							{entry.kind === "folder" ? (
								<Folder
									className="h-4 w-4 shrink-0 text-amber-500"
									aria-hidden="true"
								/>
							) : (
								<File
									className="h-4 w-4 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
							)}
							<span className="truncate">{entry.name}</span>
						</button>
					);
				},
			},
			{
				accessorKey: "sizeBytes",
				header: "Size",
				cell: ({ row }) => {
					const item = row.original;
					if (item.kind === "go-back") return "-";
					if (item.entry?.kind === "folder") return "-";
					return formatSize(item.sizeBytes);
				},
			},
			{
				accessorKey: "updatedAt",
				header: "Last Modified",
				cell: ({ row }) => {
					const item = row.original;
					if (item.kind === "go-back") return "-";
					return formatModified(item.updatedAt);
				},
			},
			{
				id: "actions",
				header: () => <span className="sr-only">Actions</span>,
				cell: ({ row }) => {
					const item = row.original;
					if (item.kind === "go-back") return null;
					const entry = item.entry;
					if (!entry) return null;
					return (
						<DropdownMenu>
							<DropdownMenuTrigger
								className={buttonVariants({ variant: "ghost", size: "icon" })}
								aria-label={`Actions for ${entry.name}`}
							>
								<MoreHorizontal className="size-4" aria-hidden="true" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{entry.kind === "file" ? (
									<DropdownMenuItem
										onClick={() => {
											window.location.href = `/api/files/tree/download/${entry.id}`;
										}}
									>
										Download
									</DropdownMenuItem>
								) : null}
								{entry.kind === "file" ? <DropdownMenuSeparator /> : null}
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
									onClick={() => setDialog({ type: "delete", entry })}
									disabled={!entry.canWrite}
								>
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
			},
		],
		[currentPath],
	);

	// eslint-disable-next-line react-hooks/incompatible-library
	const table = useReactTable({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<>
			<div className="space-y-4">
				<PageHeader
					title="Files"
					description="Browse company folders and manage file operations."
					actions={
						connection?.isSuperAdmin ? (
							<CreateCompanyDialog
								onCreated={(message) => setStatus({ message })}
								disabled={isFetching}
							/>
						) : undefined
					}
				/>

				<div className="space-y-3">
					<Breadcrumb>
						<BreadcrumbList>
							{breadcrumbItems.map((crumb, index) => (
								<span
									key={`${crumb.label}-${index}`}
									className="flex items-center gap-1.5"
								>
									{index > 0 ? <BreadcrumbSeparator /> : null}
									<BreadcrumbItem>
										{index === breadcrumbItems.length - 1 ? (
											<BreadcrumbPage>{crumb.label}</BreadcrumbPage>
										) : (
											<BreadcrumbLink
												render={
													<button
														type="button"
														onClick={() => navigateToPath(crumb.path)}
													/>
												}
											>
												{crumb.label}
											</BreadcrumbLink>
										)}
									</BreadcrumbItem>
								</span>
							))}
						</BreadcrumbList>
					</Breadcrumb>

					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setDialog({ type: "newFolder" })}
						>
							<Plus className="mr-2 h-4 w-4" aria-hidden="true" />
							New Folder
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setDialog({ type: "upload" })}
							disabled={uploadMutation.isPending}
						>
							<Upload className="mr-2 h-4 w-4" aria-hidden="true" />
							Upload File
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void refreshMutation.mutateAsync()}
							disabled={refreshMutation.isPending}
						>
							<RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
							Refresh
						</Button>
					</div>

					{uploadProgress !== null ? (
						<div className="space-y-1.5">
							<p className="text-sm text-muted-foreground">
								Uploading to {destinationLabel} — {uploadProgress}%
							</p>
							<div className="h-1.5 w-full rounded-full bg-muted">
								<div
									className="h-full rounded-full bg-primary transition-[width]"
									style={{ width: `${uploadProgress}%` }}
								/>
							</div>
						</div>
					) : null}

					{activeStatus ? (
						<Alert variant={activeStatus.error ? "destructive" : "default"}>
							<AlertDescription>{activeStatus.message}</AlertDescription>
						</Alert>
					) : null}
				</div>

				<Card>
					<CardContent className="px-0 pb-0">
						<Table>
							<TableHeader>
								{table.getHeaderGroups().map((headerGroup) => (
									<TableRow key={headerGroup.id}>
										{headerGroup.headers.map((header) => (
											<TableHead key={header.id}>
												{header.isPlaceholder
													? null
													: flexRender(
															header.column.columnDef.header,
															header.getContext(),
														)}
											</TableHead>
										))}
									</TableRow>
								))}
							</TableHeader>
							<TableBody>
								{isFetching ? (
									<TableRow>
										<TableCell colSpan={4} className="py-10 text-center">
											<Loader2
												className="mx-auto h-5 w-5 animate-spin text-muted-foreground"
												aria-hidden="true"
											/>
										</TableCell>
									</TableRow>
								) : table.getRowModel().rows.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={4}
											className="py-10 text-center text-sm text-muted-foreground"
										>
											No items in this directory.
										</TableCell>
									</TableRow>
								) : (
									table.getRowModel().rows.map((row) => (
										<TableRow key={row.id}>
											{row.getVisibleCells().map((cell) => (
												<TableCell key={cell.id}>
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</TableCell>
											))}
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</div>

			{/* New Folder dialog */}
			<Dialog
				open={dialog.type === "newFolder"}
				onOpenChange={(open) => !open && setDialog({ type: "closed" })}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create new folder</DialogTitle>
						<DialogDescription>
							This folder will be created inside {destinationLabel}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor="folder-name">Folder name</Label>
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
									if (name) void createFolderMutation.mutateAsync(name);
								}
							}}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDialog({ type: "closed" })}
							disabled={isDialogWorking}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								const name = folderName.trim();
								if (name) void createFolderMutation.mutateAsync(name);
							}}
							disabled={!folderName.trim() || isDialogWorking}
						>
							{createFolderMutation.isPending ? (
								<Loader2
									className="mr-2 h-4 w-4 animate-spin"
									aria-hidden="true"
								/>
							) : null}
							Create Folder
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Upload dialog */}
			<Dialog
				open={dialog.type === "upload"}
				onOpenChange={(open) => {
					if (!open) {
						setDialog({ type: "closed" });
						setUploadFile(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Upload file</DialogTitle>
						<DialogDescription>
							This file will be uploaded to {destinationLabel}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="upload-file">Select file</Label>
						<Input
							id="upload-file"
							type="file"
							ref={uploadInputRef}
							onChange={(event) => {
								const selected = event.target.files?.[0] ?? null;
								if (!selected) {
									setUploadFile(null);
									return;
								}
								if (selected.size === 0 || selected.size > MAX_UPLOAD_BYTES) {
									setUploadFile(null);
									setStatus({
										message: "File must be between 1 byte and 1024 MB.",
										error: true,
									});
									if (uploadInputRef.current) {
										uploadInputRef.current.value = "";
									}
									return;
								}
								setUploadFile(selected);
							}}
						/>
						<p className="text-sm text-muted-foreground">
							Maximum file size:{" "}
							<span className="font-medium text-foreground">1 GB</span>
						</p>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setDialog({ type: "closed" });
								setUploadFile(null);
							}}
							disabled={isDialogWorking}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (!uploadFile) return;
								if (
									uploadFile.size === 0 ||
									uploadFile.size > MAX_UPLOAD_BYTES
								) {
									setStatus({
										message: "File must be between 1 byte and 1024 MB.",
										error: true,
									});
									return;
								}
								void uploadMutation.mutateAsync(uploadFile);
							}}
							disabled={!uploadFile || isDialogWorking}
						>
							{uploadMutation.isPending ? (
								<Loader2
									className="mr-2 h-4 w-4 animate-spin"
									aria-hidden="true"
								/>
							) : null}
							Upload
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Rename dialog */}
			<Dialog
				open={dialog.type === "rename"}
				onOpenChange={(open) => !open && setDialog({ type: "closed" })}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rename item</DialogTitle>
						<DialogDescription>
							Choose a new name for{" "}
							{dialog.type === "rename" ? dialog.entry.name : "this item"}.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor="rename-name">New name</Label>
						<Input
							id="rename-name"
							name="renameName"
							autoComplete="off"
							value={renameName}
							onChange={(event) => setRenameName(event.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDialog({ type: "closed" })}
							disabled={isDialogWorking}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (dialog.type !== "rename") return;
								const nextName = renameName.trim();
								if (!nextName || nextName === dialog.entry.name) return;
								void renameMutation.mutateAsync({
									id: dialog.entry.id,
									name: nextName,
								});
							}}
							disabled={
								dialog.type !== "rename" ||
								!renameName.trim() ||
								(dialog.type === "rename" &&
									renameName.trim() === dialog.entry.name) ||
								isDialogWorking
							}
						>
							{renameMutation.isPending ? (
								<Loader2
									className="mr-2 h-4 w-4 animate-spin"
									aria-hidden="true"
								/>
							) : null}
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation — AlertDialog for destructive action */}
			<AlertDialog
				open={dialog.type === "delete"}
				onOpenChange={(open) => !open && setDialog({ type: "closed" })}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete item</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently remove{" "}
							<span className="font-medium text-foreground">
								{dialog.type === "delete" ? dialog.entry.name : "this item"}
							</span>
							. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteMutation.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								if (dialog.type === "delete") {
									void deleteMutation.mutateAsync(dialog.entry.id);
								}
							}}
							disabled={dialog.type !== "delete" || deleteMutation.isPending}
						>
							{deleteMutation.isPending ? (
								<Loader2
									className="mr-2 h-4 w-4 animate-spin"
									aria-hidden="true"
								/>
							) : null}
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

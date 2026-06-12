"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronRight,
	File,
	Folder,
	FolderOpen,
	MoreHorizontal,
	Plus,
	RefreshCw,
	Upload,
} from "lucide-react";
import { toast } from "sonner";

import { CreateCompanyDialog } from "@/components/features/files/create-company-dialog";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
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
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Progress,
	ProgressLabel,
	ProgressValue,
} from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
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

type DialogState =
	| { type: "closed" }
	| { type: "newFolder" }
	| { type: "upload" }
	| { type: "rename"; entry: Entry }
	| { type: "delete"; entry: Entry };

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function formatSize(bytes: number) {
	if (bytes === 0) return "—";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatModified(value: string) {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
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
	const queryClient = useQueryClient();
	const [currentPath, setCurrentPath] = useState<string[]>([]);
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
		isLoading,
		isRefetching,
		error: loadError,
		refetch,
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
			toast.success(`Created folder "${name}" in ${destinationLabel}`);
			setFolderName("");
			setDialog({ type: "closed" });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPathString],
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create folder.",
			);
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
			toast.success(`Uploaded file to ${destinationLabel}`);
			setUploadFile(null);
			setDialog({ type: "closed" });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPathString],
			});
		},
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Upload failed.");
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
			toast.success("Item renamed.");
			setDialog({ type: "closed" });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPathString],
			});
		},
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Rename failed.");
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
			toast.success("Item deleted.");
			setDialog({ type: "closed" });
			await queryClient.invalidateQueries({
				queryKey: ["files-tree", currentPathString],
			});
		},
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Delete failed.");
		},
	});

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

	function navigateToPath(path: string[]) {
		setCurrentPath(path);
	}

	function renderEntryRow(entry: Entry) {
		return (
			<TableRow key={entry.id}>
				<TableCell>
					{entry.kind === "folder" ? (
						<button
							type="button"
							className="flex min-w-0 items-center gap-2 text-left font-medium hover:underline"
							onClick={() => navigateToPath([...currentPath, entry.name])}
						>
							<Folder
								className="size-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span className="truncate">{entry.name}</span>
						</button>
					) : (
						<span className="flex min-w-0 items-center gap-2 font-medium">
							<File
								className="size-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span className="truncate">{entry.name}</span>
						</span>
					)}
				</TableCell>
				<TableCell className="text-muted-foreground">
					{entry.kind === "folder" ? "—" : formatSize(entry.sizeBytes)}
				</TableCell>
				<TableCell className="text-muted-foreground">
					{formatModified(entry.updatedAt)}
				</TableCell>
				<TableCell className="text-right">
					<DropdownMenu>
						<DropdownMenuTrigger
							className={buttonVariants({ variant: "ghost", size: "icon" })}
							aria-label={`Actions for ${entry.name}`}
						>
							<MoreHorizontal className="size-4" aria-hidden="true" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuGroup>
								{entry.kind === "file" ? (
									<DropdownMenuItem
										onClick={() => {
											window.location.href = `/api/files/tree/download/${entry.id}`;
										}}
									>
										Download
									</DropdownMenuItem>
								) : null}
								<DropdownMenuItem
									onClick={() => {
										setRenameName(entry.name);
										setDialog({ type: "rename", entry });
									}}
									disabled={!entry.canWrite}
								>
									Rename
								</DropdownMenuItem>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									className="text-destructive focus:text-destructive"
									onClick={() => setDialog({ type: "delete", entry })}
									disabled={!entry.canWrite}
								>
									Delete
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</TableCell>
			</TableRow>
		);
	}

	function renderTableBody() {
		if (isLoading) {
			return <TableSkeletonRows rows={6} columns={4} />;
		}

		if (loadError) {
			return (
				<TableRow>
					<TableCell colSpan={4} className="p-4">
						<ErrorState
							title="Unable to load files"
							description="Something went wrong while loading this folder. Try again."
							onRetry={() => void refetch()}
						/>
					</TableCell>
				</TableRow>
			);
		}

		const goBackRow =
			currentPath.length > 0 ? (
				<TableRow key="go-back">
					<TableCell colSpan={4}>
						<button
							type="button"
							onClick={() => navigateToPath(currentPath.slice(0, -1))}
							className="flex items-center gap-2 font-medium text-muted-foreground hover:text-foreground"
						>
							<ChevronRight className="size-4 rotate-180" aria-hidden="true" />
							<span>Up one level</span>
						</button>
					</TableCell>
				</TableRow>
			) : null;

		if (entries.length === 0) {
			return (
				<>
					{goBackRow}
					<TableRow>
						<TableCell colSpan={4}>
							<EmptyState
								icon={FolderOpen}
								title="This folder is empty"
								description="Upload a file or create a folder to get started."
								action={
									<Button
										variant="outline"
										size="sm"
										onClick={() => setDialog({ type: "upload" })}
									>
										<Upload data-icon="inline-start" aria-hidden="true" />
										Upload file
									</Button>
								}
							/>
						</TableCell>
					</TableRow>
				</>
			);
		}

		return (
			<>
				{goBackRow}
				{entries.map(renderEntryRow)}
			</>
		);
	}

	return (
		<>
			<div className="flex flex-col gap-4">
				<PageHeader
					title="Files"
					description="Browse company folders and manage shared files."
					actions={
						<>
							{connection?.isSuperAdmin ? (
								<CreateCompanyDialog
									onCreated={(message) => toast.success(message)}
								/>
							) : null}
							<Button
								variant="outline"
								onClick={() => setDialog({ type: "newFolder" })}
							>
								<Plus data-icon="inline-start" aria-hidden="true" />
								New folder
							</Button>
							<Button
								onClick={() => setDialog({ type: "upload" })}
								disabled={uploadMutation.isPending}
							>
								<Upload data-icon="inline-start" aria-hidden="true" />
								Upload file
							</Button>
						</>
					}
				/>

				<div className="flex items-center justify-between gap-2">
					<Breadcrumb>
						<BreadcrumbList>
							{breadcrumbItems.map((crumb, index) => (
								<Fragment key={`${crumb.label}-${index}`}>
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
								</Fragment>
							))}
						</BreadcrumbList>
					</Breadcrumb>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => void refetch()}
						disabled={isRefetching}
						aria-label="Refresh file list"
					>
						{isRefetching ? (
							<Spinner aria-hidden="true" />
						) : (
							<RefreshCw aria-hidden="true" />
						)}
					</Button>
				</div>

				{uploadProgress !== null ? (
					<Progress value={uploadProgress}>
						<ProgressLabel>Uploading to {destinationLabel}</ProgressLabel>
						<ProgressValue />
					</Progress>
				) : null}

				<Card className="py-0">
					<CardContent className="px-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead className="w-28">Size</TableHead>
									<TableHead className="w-44">Last modified</TableHead>
									<TableHead className="w-14 text-right">
										<span className="sr-only">Actions</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>{renderTableBody()}</TableBody>
						</Table>
					</CardContent>
				</Card>
			</div>

			{/* New folder dialog */}
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
					<Field>
						<FieldLabel htmlFor="folder-name">Folder name</FieldLabel>
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
					</Field>
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
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							Create folder
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
					<Field>
						<FieldLabel htmlFor="upload-file">Select file</FieldLabel>
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
									toast.error("File must be between 1 byte and 1 GB.");
									if (uploadInputRef.current) {
										uploadInputRef.current.value = "";
									}
									return;
								}
								setUploadFile(selected);
							}}
						/>
						<FieldDescription>Maximum file size: 1 GB</FieldDescription>
					</Field>
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
									toast.error("File must be between 1 byte and 1 GB.");
									return;
								}
								void uploadMutation.mutateAsync(uploadFile);
							}}
							disabled={!uploadFile || isDialogWorking}
						>
							{uploadMutation.isPending ? (
								<Spinner data-icon="inline-start" aria-hidden="true" />
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
					<Field>
						<FieldLabel htmlFor="rename-name">New name</FieldLabel>
						<Input
							id="rename-name"
							name="renameName"
							autoComplete="off"
							value={renameName}
							onChange={(event) => setRenameName(event.target.value)}
						/>
					</Field>
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
								<Spinner data-icon="inline-start" aria-hidden="true" />
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
						<AlertDialogTitle>Delete item?</AlertDialogTitle>
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
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

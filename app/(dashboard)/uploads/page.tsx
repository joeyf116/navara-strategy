"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
Upload,
FileText,
CheckCircle,
AlertTriangle,
Trash2,
FileUp,
X,
Clock,
Download,
Inbox,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
Table,
TableBody,
TableCell,
TableHead,
TableHeader,
TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

type SharedFile = {
id: string;
original_name: string;
storage_key: string;
size_bytes: number;
uploaded_by: string;
uploaded_by_email: string;
owner_email: string;
source: "user_upload" | "admin_share" | "system_generated";
uploaded_at: string;
};

type FilesResponse = {
files: SharedFile[];
};

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".json", ".xml", ".pdf", ".txt", ".dat"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function formatFileSize(bytes: number): string {
if (bytes < 1024) return `${bytes} B`;
if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFileSelection(fileList: File[]): string | null {
for (const file of fileList) {
const dotIndex = file.name.lastIndexOf(".");
if (dotIndex === -1 || dotIndex === file.name.length - 1) {
return `File "${file.name}" has no valid extension. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
}
const ext = file.name.slice(dotIndex).toLowerCase();
if (!ALLOWED_EXTENSIONS.includes(ext)) {
return `File type "${ext}" is not supported. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
}
if (file.size > MAX_FILE_SIZE) {
return `File "${file.name}" exceeds the maximum size of ${formatFileSize(MAX_FILE_SIZE)}.`;
}
if (file.size === 0) {
return `File "${file.name}" is empty.`;
}
}
return null;
}

function getFileFingerprint(file: File): string {
return `${file.name}-${file.size}-${file.lastModified}`;
}

function sourceLabel(source: SharedFile["source"]) {
switch (source) {
case "admin_share":
return "Admin Shared";
case "system_generated":
return "System";
default:
return "Uploaded";
}
}

export default function FilePortalPage() {
const { data: session } = useSession();
const user = session?.user;
const isManager = user?.role === "super_admin" || user?.role === "admin";
const userEmail = user?.email?.toLowerCase() ?? "";

const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
const [targetUserEmail, setTargetUserEmail] = useState("");
const [status, setStatus] = useState("");
const [isUploading, setIsUploading] = useState(false);
const [dragActive, setDragActive] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
const queryClient = useQueryClient();

const { data, isLoading } = useQuery<FilesResponse>({
queryKey: ["uploads"],
queryFn: () => fetch("/api/files").then((r) => r.json()),
});

const files = useMemo(() => data?.files ?? [], [data?.files]);
const myUploads = useMemo(
() => files.filter((file) => file.uploaded_by_email.toLowerCase() === userEmail),
[files, userEmail],
);
const sharedWithMe = useMemo(
() => files.filter((file) => file.owner_email.toLowerCase() === userEmail && file.uploaded_by_email.toLowerCase() !== userEmail),
[files, userEmail],
);

const totalAccessible = files.length;
const totalSize = files.reduce((sum, file) => sum + file.size_bytes, 0);
const uniqueOwners = new Set(files.map((file) => file.owner_email.toLowerCase())).size;

function handleDrag(e: React.DragEvent) {
e.preventDefault();
e.stopPropagation();
if (e.type === "dragenter" || e.type === "dragover") {
setDragActive(true);
} else if (e.type === "dragleave") {
setDragActive(false);
}
}

function handleDrop(e: React.DragEvent) {
e.preventDefault();
e.stopPropagation();
setDragActive(false);

const droppedFiles = Array.from(e.dataTransfer.files);
const error = validateFileSelection(droppedFiles);
if (error) {
setStatus(error);
return;
}

setSelectedFiles((prev) => {
const map = new Map(prev.map((f) => [getFileFingerprint(f), f]));
for (const file of droppedFiles) {
map.set(getFileFingerprint(file), file);
}
return Array.from(map.values());
});
setStatus("");
}

function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
const selected = Array.from(e.target.files ?? []);
const error = validateFileSelection(selected);
if (error) {
setStatus(error);
return;
}

setSelectedFiles((prev) => {
const map = new Map(prev.map((f) => [getFileFingerprint(f), f]));
for (const file of selected) {
map.set(getFileFingerprint(file), file);
}
return Array.from(map.values());
});
setStatus("");
}

function removeSelectedFile(index: number) {
setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
}

async function handleSubmit(event: FormEvent<HTMLFormElement>) {
event.preventDefault();

if (!user?.email) {
setStatus("You must be signed in to upload files.");
return;
}

if (selectedFiles.length === 0) {
setStatus("Choose at least one file.");
return;
}

setStatus("");
setIsUploading(true);
let successCount = 0;
let failureCount = 0;
const uploadErrors: string[] = [];

try {
	for (const file of selectedFiles) {
		const formData = new FormData();
		formData.append("file", file);
		if (isManager && targetUserEmail.trim()) {
			formData.append("targetUserEmail", targetUserEmail.trim().toLowerCase());
		}

		try {
			const response = await fetch("/api/files", { method: "POST", body: formData });
			if (response.ok) {
				successCount += 1;
			} else {
				failureCount += 1;
				const payload = (await response.json().catch(() => ({}))) as { error?: string };
				const errorMessage = payload.error ?? `HTTP ${response.status}`;
				uploadErrors.push(`${file.name}: ${errorMessage}`);
			}
		} catch {
			failureCount += 1;
			uploadErrors.push(`${file.name}: Network error while uploading.`);
		}
	}

	await queryClient.invalidateQueries({ queryKey: ["uploads"] });
	setSelectedFiles([]);

	if (fileInputRef.current) {
		fileInputRef.current.value = "";
	}

	if (failureCount === 0) {
		setStatus(`Uploaded ${successCount} file(s) successfully.`);
		return;
	}

	setStatus(
		`Uploaded ${successCount} file(s). ${failureCount} file(s) failed: ${uploadErrors.slice(0, 2).join("; ")}${uploadErrors.length > 2 ? "..." : ""}`,
	);
} finally {
	setIsUploading(false);
}
}

if (isLoading) {
return (
<div className="space-y-6">
<div>
<h1 className="text-2xl font-bold">File Portal</h1>
<p className="text-muted-foreground">Secure uploads and downloads for your account</p>
</div>
<div className="grid gap-4 sm:grid-cols-3">
{Array.from({ length: 3 }).map((_, i) => (
<Card key={i}>
<CardContent className="p-4">
<Skeleton className="h-12 w-full" />
</CardContent>
</Card>
))}
</div>
</div>
);
}

return (
<div className="space-y-6">
<div>
<h1 className="text-2xl font-bold">{isManager ? "File Management" : "Client File Portal"}</h1>
<p className="text-muted-foreground">
{isManager
? "Manage uploads and distribute files to client accounts"
: "Upload your files and download files shared with your account"}
</p>
</div>

<div className="grid gap-4 sm:grid-cols-3">
<Card>
<CardContent className="p-4">
<div className="flex items-center justify-between">
<div className="space-y-1">
<p className="text-xs font-medium text-muted-foreground">Accessible Files</p>
<p className="text-2xl font-bold">{totalAccessible}</p>
</div>
<div className="rounded-lg bg-muted p-2.5">
<FileUp className="h-5 w-5 text-muted-foreground" />
</div>
</div>
</CardContent>
</Card>
<Card>
<CardContent className="p-4">
<div className="flex items-center justify-between">
<div className="space-y-1">
<p className="text-xs font-medium text-muted-foreground">
{isManager ? "Client Portals" : "Shared With Me"}
</p>
<p className="text-2xl font-bold text-green-600 dark:text-green-400">
{isManager ? uniqueOwners : sharedWithMe.length}
</p>
</div>
<div className="rounded-lg bg-green-500/10 p-2.5">
<CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
</div>
</div>
</CardContent>
</Card>
<Card>
<CardContent className="p-4">
<div className="flex items-center justify-between">
<div className="space-y-1">
<p className="text-xs font-medium text-muted-foreground">Storage Used</p>
<p className="text-2xl font-bold">{formatFileSize(totalSize)}</p>
</div>
<div className="rounded-lg bg-blue-500/10 p-2.5">
<Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
</div>
</div>
</CardContent>
</Card>
</div>

<Card>
<CardHeader>
<CardTitle>{isManager ? "Upload / Share Files" : "Upload Files"}</CardTitle>
<CardDescription>
Drag and drop files or click to browse. Supported formats: {ALLOWED_EXTENSIONS.join(", ")}. Max size: {formatFileSize(MAX_FILE_SIZE)}.
</CardDescription>
</CardHeader>
<CardContent>
<form onSubmit={handleSubmit} className="space-y-4">
{isManager && (
<Input
aria-label="Target user email"
placeholder="Target user email (leave blank to upload to your portal)"
value={targetUserEmail}
onChange={(e) => setTargetUserEmail(e.target.value)}
type="email"
/>
)}

<div
className={`relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
dragActive
? "border-primary bg-primary/5"
: "border-border hover:border-primary/50"
}`}
onDragEnter={handleDrag}
onDragLeave={handleDrag}
onDragOver={handleDrag}
onDrop={handleDrop}
onClick={() => fileInputRef.current?.click()}
>
<Upload className="mb-2 h-8 w-8 text-muted-foreground" />
<p className="text-sm font-medium">
{dragActive ? "Drop files here" : "Drag & drop files or click to browse"}
</p>
<p className="mt-1 text-xs text-muted-foreground">Multiple files supported</p>
<input
ref={fileInputRef}
type="file"
multiple
className="hidden"
onChange={handleFileSelect}
accept={ALLOWED_EXTENSIONS.join(",")}
/>
</div>

{selectedFiles.length > 0 && (
<div className="space-y-2">
<p className="text-sm font-medium">{selectedFiles.length} file(s) selected</p>
<div className="flex flex-wrap gap-2">
{selectedFiles.map((file, idx) => (
<div
key={getFileFingerprint(file)}
className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5"
>
<FileText className="h-3.5 w-3.5 text-muted-foreground" />
<span className="text-sm">{file.name}</span>
<span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
<button
type="button"
onClick={(e) => {
e.stopPropagation();
removeSelectedFile(idx);
}}
className="ml-1 rounded-full p-0.5 hover:bg-muted"
>
<X className="h-3 w-3 text-muted-foreground" />
</button>
</div>
))}
</div>
</div>
)}

<div className="flex items-center gap-3">
<Button type="submit" disabled={isUploading || selectedFiles.length === 0}>
<Upload className="mr-2 h-4 w-4" />
{isUploading ? "Uploading..." : `Upload ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ""}`}
</Button>
{selectedFiles.length > 0 && (
<Button type="button" variant="outline" onClick={() => setSelectedFiles([])}>
<Trash2 className="mr-2 h-4 w-4" />
Clear
</Button>
)}
</div>

{status && (
<p
className={`text-sm ${
status.includes("failed")
? "text-destructive"
: status.includes("Uploaded")
? "text-green-600 dark:text-green-400"
: "text-muted-foreground"
}`}
>
{status}
</p>
)}
</form>
</CardContent>
</Card>

<Card>
<CardHeader>
<CardTitle>{isManager ? "File Management" : "My Portal Files"}</CardTitle>
<CardDescription>
{isManager
? "All files across users and admin shared content"
: "Your uploads and files shared to your account"}
</CardDescription>
</CardHeader>
<CardContent>
<Table>
<TableHeader>
<TableRow>
<TableHead>File</TableHead>
{isManager ? <TableHead>Owner</TableHead> : <TableHead>From</TableHead>}
<TableHead>Type</TableHead>
<TableHead>Size</TableHead>
<TableHead className="hidden lg:table-cell">Uploaded At</TableHead>
<TableHead className="w-24">Actions</TableHead>
</TableRow>
</TableHeader>
<TableBody>
{files.length === 0 ? (
<TableRow>
<TableCell colSpan={6} className="text-center text-muted-foreground">
No files available yet.
</TableCell>
</TableRow>
) : (
files.map((file) => (
<TableRow key={file.id}>
<TableCell className="font-medium">
<div className="flex items-center gap-2">
<FileText className="h-4 w-4 text-muted-foreground" />
{file.original_name}
</div>
</TableCell>
<TableCell>{isManager ? file.owner_email : file.uploaded_by}</TableCell>
<TableCell>
<Badge variant="outline">{sourceLabel(file.source)}</Badge>
</TableCell>
<TableCell>{formatFileSize(file.size_bytes)}</TableCell>
<TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
{new Date(file.uploaded_at).toLocaleString()}
</TableCell>
<TableCell>
<Button
										variant="outline"
										size="sm"
	aria-label={`Download ${file.original_name}`}
	onClick={() => {
		window.location.href = `/api/files/${encodeURIComponent(file.id)}/download`;
	}}
									>
										<Download className="h-3.5 w-3.5" />
									</Button>
</TableCell>
</TableRow>
))
)}
</TableBody>
</Table>
</CardContent>
</Card>

{!isManager && (
<Card>
<CardHeader>
<CardTitle className="text-base">My Upload Summary</CardTitle>
</CardHeader>
<CardContent className="grid gap-4 sm:grid-cols-2">
<div className="rounded-lg border border-border p-4">
<div className="flex items-center gap-2 text-sm text-muted-foreground">
<FileUp className="h-4 w-4" /> My Uploads
</div>
<p className="mt-2 text-2xl font-bold">{myUploads.length}</p>
</div>
<div className="rounded-lg border border-border p-4">
<div className="flex items-center gap-2 text-sm text-muted-foreground">
<Inbox className="h-4 w-4" /> Shared to Me
</div>
<p className="mt-2 text-2xl font-bold">{sharedWithMe.length}</p>
</div>
</CardContent>
</Card>
)}

{status.includes("failed") && (
<div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
<AlertTriangle className="h-4 w-4" />
Some uploads failed validation checks. Retry with supported formats and size limits.
</div>
)}
</div>
);
}

"use client";

import { FormEvent, useMemo, useState, useRef } from "react";
import {
	Upload,
	FileText,
	CheckCircle,
	AlertTriangle,
	Trash2,
	FileUp,
	X,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type UploadedFile = {
	id: string;
	name: string;
	size: number;
	uploadedBy: string;
	tenant: string;
	status: "uploading" | "uploaded" | "validating" | "validated" | "failed";
	uploadedAt: string;
	validationErrors: number;
};

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".json", ".xml", ".pdf", ".txt", ".dat"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Mock initial uploaded files
function getInitialFiles(): UploadedFile[] {
	const now = Date.now();
	return [
		{ id: "up-001", name: "transactions_2024_q4.csv", size: 15200000, uploadedBy: "Admin User", tenant: "Acme Corporation", status: "validated", uploadedAt: new Date(now - 300000).toISOString(), validationErrors: 0 },
		{ id: "up-002", name: "payroll_batch_dec.xlsx", size: 8400000, uploadedBy: "Admin User", tenant: "GlobalTech Industries", status: "validated", uploadedAt: new Date(now - 3600000).toISOString(), validationErrors: 3 },
		{ id: "up-003", name: "client_data_export.json", size: 2100000, uploadedBy: "Tenant User", tenant: "Sterling Partners", status: "failed", uploadedAt: new Date(now - 7200000).toISOString(), validationErrors: 5 },
		{ id: "up-004", name: "invoice_batch_001.csv", size: 4500000, uploadedBy: "Admin User", tenant: "Acme Corporation", status: "uploaded", uploadedAt: new Date(now - 120000).toISOString(), validationErrors: 0 },
		{ id: "up-005", name: "vendor_payments.csv", size: 6200000, uploadedBy: "Admin User", tenant: "Vanguard Analytics", status: "validated", uploadedAt: new Date(now - 14400000).toISOString(), validationErrors: 0 },
	];
}

export default function WebUploadsPage() {
	const [files, setFiles] = useState<UploadedFile[]>(getInitialFiles);
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [uploadedBy, setUploadedBy] = useState("");
	const [tenant, setTenant] = useState("");
	const [status, setStatus] = useState("");
	const [isUploading, setIsUploading] = useState(false);
	const [dragActive, setDragActive] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const totalUploaded = useMemo(() => files.length, [files]);
	const totalValidated = useMemo(() => files.filter((f) => f.status === "validated").length, [files]);
	const totalFailed = useMemo(() => files.filter((f) => f.status === "failed").length, [files]);

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
		setSelectedFiles((prev) => [...prev, ...droppedFiles]);
		setStatus("");
	}

	function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
		const selected = Array.from(e.target.files ?? []);
		const error = validateFileSelection(selected);
		if (error) {
			setStatus(error);
			return;
		}
		setSelectedFiles((prev) => [...prev, ...selected]);
		setStatus("");
	}

	function removeSelectedFile(index: number) {
		setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (selectedFiles.length === 0 || !uploadedBy.trim() || !tenant) {
			setStatus("Provide your name, select a tenant, and choose at least one file.");
			return;
		}

		setStatus("");
		setIsUploading(true);

		// Simulate upload for each file
		const newFiles: UploadedFile[] = [];
		for (const file of selectedFiles) {
			const newFile: UploadedFile = {
				id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				name: file.name,
				size: file.size,
				uploadedBy: uploadedBy.trim(),
				tenant,
				status: "uploading",
				uploadedAt: new Date().toISOString(),
				validationErrors: 0,
			};
			newFiles.push(newFile);
		}

		setFiles((prev) => [...newFiles, ...prev]);

		// Simulate upload completion after delay
		await new Promise((resolve) => setTimeout(resolve, 1500));

		setFiles((prev) =>
			prev.map((f) =>
				newFiles.some((nf) => nf.id === f.id)
					? { ...f, status: "validating" as const }
					: f,
			),
		);

		// Simulate validation completion
		await new Promise((resolve) => setTimeout(resolve, 1000));

		setFiles((prev) =>
			prev.map((f) =>
				newFiles.some((nf) => nf.id === f.id)
					? { ...f, status: "validated" as const }
					: f,
			),
		);

		setSelectedFiles([]);
		setIsUploading(false);
		setStatus(`Successfully uploaded ${newFiles.length} file(s).`);

		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Web Uploads</h1>
				<p className="text-muted-foreground">
					Upload files directly through the web interface with automatic validation
				</p>
			</div>

			{/* Summary cards */}
			<div className="grid gap-4 sm:grid-cols-3">
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">Total Uploaded</p>
								<p className="text-2xl font-bold">{totalUploaded}</p>
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
								<p className="text-xs font-medium text-muted-foreground">Validated</p>
								<p className="text-2xl font-bold text-green-600 dark:text-green-400">{totalValidated}</p>
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
								<p className="text-xs font-medium text-muted-foreground">Failed</p>
								<p className="text-2xl font-bold text-destructive">{totalFailed}</p>
							</div>
							<div className="rounded-lg bg-destructive/10 p-2.5">
								<AlertTriangle className="h-5 w-5 text-destructive" />
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Upload form */}
			<Card>
				<CardHeader>
					<CardTitle>Upload Files</CardTitle>
					<CardDescription>
						Drag and drop files or click to browse. Supported formats: {ALLOWED_EXTENSIONS.join(", ")}. Max size: {formatFileSize(MAX_FILE_SIZE)}.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="grid gap-3 sm:grid-cols-2">
							<Input
								aria-label="Uploader name"
								placeholder="Your name"
								value={uploadedBy}
								onChange={(e) => setUploadedBy(e.target.value)}
								required
							/>
							<Select value={tenant} onValueChange={setTenant}>
								<SelectTrigger>
									<SelectValue placeholder="Select tenant" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Acme Corporation">Acme Corporation</SelectItem>
									<SelectItem value="GlobalTech Industries">GlobalTech Industries</SelectItem>
									<SelectItem value="Sterling Partners">Sterling Partners</SelectItem>
									<SelectItem value="Meridian Financial">Meridian Financial</SelectItem>
									<SelectItem value="Vanguard Analytics">Vanguard Analytics</SelectItem>
									<SelectItem value="Horizon Capital">Horizon Capital</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Drop zone */}
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
							<p className="mt-1 text-xs text-muted-foreground">
								Multiple files supported
							</p>
							<input
								ref={fileInputRef}
								type="file"
								multiple
								className="hidden"
								onChange={handleFileSelect}
								accept={ALLOWED_EXTENSIONS.join(",")}
							/>
						</div>

						{/* Selected files */}
						{selectedFiles.length > 0 && (
							<div className="space-y-2">
								<p className="text-sm font-medium">
									{selectedFiles.length} file(s) selected
								</p>
								<div className="flex flex-wrap gap-2">
									{selectedFiles.map((file, idx) => (
										<div
											key={idx}
											className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5"
										>
											<FileText className="h-3.5 w-3.5 text-muted-foreground" />
											<span className="text-sm">{file.name}</span>
											<span className="text-xs text-muted-foreground">
												({formatFileSize(file.size)})
											</span>
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
								<Button
									type="button"
									variant="outline"
									onClick={() => setSelectedFiles([])}
								>
									<Trash2 className="mr-2 h-4 w-4" />
									Clear
								</Button>
							)}
						</div>

						{status && (
							<p className={`text-sm ${status.includes("Successfully") ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
								{status}
							</p>
						)}
					</form>
				</CardContent>
			</Card>

			{/* Upload history */}
			<Card>
				<CardHeader>
					<CardTitle>Upload History</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>File</TableHead>
								<TableHead>Tenant</TableHead>
								<TableHead>Uploaded By</TableHead>
								<TableHead>Size</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="hidden md:table-cell">Validation</TableHead>
								<TableHead className="hidden lg:table-cell">Uploaded At</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{files.length === 0 ? (
								<TableRow>
									<TableCell colSpan={7} className="text-center text-muted-foreground">
										No files uploaded yet.
									</TableCell>
								</TableRow>
							) : (
								files.map((file) => (
									<TableRow key={file.id}>
										<TableCell className="font-medium">
											<div className="flex items-center gap-2">
												<FileText className="h-4 w-4 text-muted-foreground" />
												{file.name}
											</div>
										</TableCell>
										<TableCell>{file.tenant}</TableCell>
										<TableCell>{file.uploadedBy}</TableCell>
										<TableCell>{formatFileSize(file.size)}</TableCell>
										<TableCell>
											<Badge
												variant={
													file.status === "validated"
														? "outline"
														: file.status === "failed"
															? "destructive"
															: "secondary"
												}
												className={
													file.status === "validated"
														? "border-green-500 text-green-600 dark:text-green-400"
														: file.status === "uploading" || file.status === "validating"
															? "animate-pulse"
															: ""
												}
											>
												{file.status}
											</Badge>
										</TableCell>
										<TableCell className="hidden md:table-cell">
											{file.validationErrors > 0 ? (
												<Badge variant="secondary">
													{file.validationErrors} error(s)
												</Badge>
											) : file.status === "validated" ? (
												<span className="text-green-600 dark:text-green-400 text-sm">✓ Clean</span>
											) : (
												<span className="text-muted-foreground text-sm">—</span>
											)}
										</TableCell>
										<TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
											{new Date(file.uploadedAt).toLocaleString()}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}

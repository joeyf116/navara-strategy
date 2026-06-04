"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	CheckCircle2,
	Clock,
	FileSpreadsheet,
	Loader2,
	UploadCloud,
	XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { ImportJob } from "@/lib/excel-upload";

const MAX_BYTES = 1_073_741_824; // 1 GiB
const ALLOWED_EXTS = new Set(["xlsx", "xls"]);

type Phase =
	| "idle"
	| "presigning"
	| "uploading"
	| "processing"
	| "done"
	| "error";

type PresignResponse = {
	jobId: string;
	uploadUrl: string;
	contentType: string;
};
type StatusResponse = { job: ImportJob };
type ConnectionInfo = {
	isSuperAdmin: boolean;
	database: {
		connectionString: string;
	} | null;
};

async function requestPresignedUrl(file: File): Promise<PresignResponse> {
	const res = await fetch("/api/excel-upload/presign", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ filename: file.name, size: file.size }),
	});
	const payload = (await res.json()) as PresignResponse & { error?: string };
	if (!res.ok)
		throw new Error(payload.error ?? "Failed to request upload URL.");
	return payload;
}

function uploadToS3(
	uploadUrl: string,
	file: File,
	contentType: string,
	onProgress: (pct: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable)
				onProgress(Math.round((e.loaded / e.total) * 100));
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve();
			} else {
				reject(new Error(`S3 upload failed with HTTP ${xhr.status}.`));
			}
		};
		xhr.onerror = () =>
			reject(new Error("Network error during upload. Check your connection."));
		xhr.open("PUT", uploadUrl);
		xhr.setRequestHeader("Content-Type", contentType);
		xhr.send(file);
	});
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

export default function ExcelImportPage() {
	const [phase, setPhase] = useState<Phase>("idle");
	const [jobId, setJobId] = useState<string | null>(null);
	const [uploadPct, setUploadPct] = useState(0);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [errorMsg, setErrorMsg] = useState("");
	const [dragOver, setDragOver] = useState(false);
	const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
		"idle",
	);

	const fileInputRef = useRef<HTMLInputElement>(null);

	const { data: jobData } = useQuery<StatusResponse>({
		queryKey: ["excel-job", jobId],
		queryFn: () =>
			fetch(`/api/excel-upload/status/${jobId}`).then(
				(r) => r.json() as Promise<StatusResponse>,
			),
		enabled: phase === "processing" && !!jobId,
		refetchInterval: 3_000,
	});

	const { data: connectionInfo = null } = useQuery<ConnectionInfo>({
		queryKey: ["connection-info"],
		queryFn: async () => {
			const response = await fetch("/api/settings/connection-info");
			const payload = (await response
				.json()
				.catch(() => ({}))) as ConnectionInfo & {
				error?: string;
			};
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to load connection info.");
			}
			return payload;
		},
	});

	const jobStatus = jobData?.job?.status;
	const currentPhase: Phase =
		jobStatus === "done" ? "done" : jobStatus === "failed" ? "error" : phase;
	const currentErrorMessage =
		jobStatus === "failed"
			? (jobData?.job?.errorText ?? "Processing failed.")
			: errorMsg;

	const runUpload = useCallback(async (file: File) => {
		const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
		if (!ALLOWED_EXTS.has(ext)) {
			setPhase("error");
			setErrorMsg("Only .xlsx and .xls files are accepted.");
			return;
		}
		if (file.size > MAX_BYTES) {
			setPhase("error");
			setErrorMsg(
				`File exceeds the 1 GB limit (${(file.size / 1_073_741_824).toFixed(2)} GB).`,
			);
			return;
		}

		setSelectedFile(file);
		setErrorMsg("");
		setUploadPct(0);

		try {
			setPhase("presigning");
			const {
				jobId: newId,
				uploadUrl,
				contentType,
			} = await requestPresignedUrl(file);
			setJobId(newId);

			setPhase("uploading");
			await uploadToS3(uploadUrl, file, contentType, setUploadPct);

			setPhase("processing");
		} catch (err) {
			setPhase("error");
			setErrorMsg(
				err instanceof Error ? err.message : "An unexpected error occurred.",
			);
		}
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file) void runUpload(file);
		},
		[runUpload],
	);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) void runUpload(file);
		},
		[runUpload],
	);

	const reset = useCallback(() => {
		setPhase("idle");
		setJobId(null);
		setUploadPct(0);
		setSelectedFile(null);
		setErrorMsg("");
		if (fileInputRef.current) fileInputRef.current.value = "";
	}, []);

	const handleCopyConnectionString = useCallback(async () => {
		const value = connectionInfo?.database?.connectionString;
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			setCopyStatus("copied");
			setTimeout(() => setCopyStatus("idle"), 1500);
		} catch {
			setCopyStatus("failed");
			setTimeout(() => setCopyStatus("idle"), 2000);
		}
	}, [connectionInfo?.database?.connectionString]);

	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h1 className="text-xl font-semibold">Excel Import</h1>
				<p className="text-xs text-muted-foreground">
					Upload an Excel file to import its rows into the PostgreSQL database.
				</p>
			</div>

			{connectionInfo?.isSuperAdmin && connectionInfo.database ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">
							Database Connection String
						</CardTitle>
						<CardDescription>
							Use this with psql or your SQL client.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						<p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
							{connectionInfo.database.connectionString}
						</p>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									void handleCopyConnectionString();
								}}
							>
								Copy connection string
							</Button>
							{copyStatus === "copied" ? (
								<span className="text-xs text-muted-foreground">Copied</span>
							) : null}
							{copyStatus === "failed" ? (
								<span className="text-xs text-destructive">Copy failed</span>
							) : null}
						</div>
					</CardContent>
				</Card>
			) : null}

			{currentPhase === "done" && (
				<Card>
					<CardContent className="flex flex-col items-center gap-4 py-14">
						<CheckCircle2 className="h-16 w-16 text-success" />
						<div className="text-center">
							<p className="text-lg font-semibold">Import complete</p>
							{jobData?.job?.rowCount != null && (
								<p className="text-sm text-muted-foreground">
									{jobData.job.rowCount.toLocaleString()} rows imported from{" "}
									<span className="font-medium">{selectedFile?.name}</span>.
								</p>
							)}
						</div>
						<Button onClick={reset}>Import another file</Button>
					</CardContent>
				</Card>
			)}

			{currentPhase === "error" && (
				<Card>
					<CardContent className="flex flex-col items-center gap-4 py-14">
						<XCircle className="h-16 w-16 text-destructive" />
						<div className="text-center">
							<p className="text-lg font-semibold">Import failed</p>
							<p className="mt-1 max-w-md text-sm text-destructive">
								{currentErrorMessage}
							</p>
						</div>
						<Button variant="outline" onClick={reset}>
							Try again
						</Button>
					</CardContent>
				</Card>
			)}

			{currentPhase === "processing" && (
				<Card>
					<CardContent className="flex flex-col items-center gap-4 py-14">
						<Loader2 className="h-16 w-16 animate-spin text-primary" />
						<div className="space-y-1 text-center">
							<p className="text-lg font-semibold">Processing…</p>
							<p className="text-sm text-muted-foreground">
								Parsing rows and writing to the database. Large files can take
								several minutes.
							</p>
							{selectedFile && (
								<p className="text-xs text-muted-foreground">
									{selectedFile.name} ({formatBytes(selectedFile.size)})
								</p>
							)}
							{jobData?.job?.status === "pending" && (
								<div className="mt-2 flex justify-center">
									<Badge variant="outline">
										<Clock className="mr-1 h-3 w-3" />
										Waiting for processing slot…
									</Badge>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{currentPhase === "uploading" && (
				<Card>
					<CardContent className="flex flex-col items-center gap-6 py-14">
						<UploadCloud className="h-16 w-16 text-primary" />
						<div className="w-full max-w-sm space-y-3 text-center">
							<p className="font-semibold">
								Uploading{" "}
								<span className="text-muted-foreground">
									{selectedFile?.name}
								</span>
							</p>
							<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full bg-primary transition-all duration-300"
									style={{ width: `${uploadPct}%` }}
								/>
							</div>
							<p className="text-sm text-muted-foreground">{uploadPct}%</p>
						</div>
					</CardContent>
				</Card>
			)}

			{currentPhase === "presigning" && (
				<Card>
					<CardContent className="flex flex-col items-center gap-4 py-14">
						<Loader2 className="h-16 w-16 animate-spin text-primary" />
						<p className="text-muted-foreground">Preparing upload…</p>
					</CardContent>
				</Card>
			)}

			{currentPhase === "idle" && (
				<>
					<Card>
						<CardContent className="p-6">
							<div
								className={`flex flex-col items-center gap-6 rounded-2xl border-2 border-dashed px-6 py-16 transition-colors ${
									dragOver
										? "border-primary bg-primary/5"
										: "border-border hover:border-primary/40 hover:bg-muted/20"
								}`}
								onDragOver={(e) => {
									e.preventDefault();
									setDragOver(true);
								}}
								onDragLeave={() => setDragOver(false)}
								onDrop={handleDrop}
							>
								<FileSpreadsheet className="h-16 w-16 text-muted-foreground" />
								<div className="space-y-1 text-center">
									<p className="text-lg font-semibold">
										Drop your Excel file here
									</p>
									<p className="text-sm text-muted-foreground">
										Supports{" "}
										<span className="font-medium text-foreground">.xlsx</span>{" "}
										and{" "}
										<span className="font-medium text-foreground">.xls</span> —
										up to{" "}
										<span className="font-medium text-foreground">1 GB</span>
									</p>
								</div>
								<input
									ref={fileInputRef}
									type="file"
									accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
									className="sr-only"
									onChange={handleFileChange}
								/>
								<Button onClick={() => fileInputRef.current?.click()}>
									<UploadCloud className="h-4 w-4" />
									Select file
								</Button>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-sm">How it works</CardTitle>
							<CardDescription>
								Files are never routed through the web server.
							</CardDescription>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							<ol className="list-inside list-decimal space-y-1">
								<li>
									Select or drop an Excel file (.xlsx or .xls, up to 1 GB).
								</li>
								<li>
									The file uploads directly to S3 via a presigned URL — no web
									server payload limit applies.
								</li>
								<li>
									A background worker parses each row and batch-inserts into
									PostgreSQL in chunks of 500 rows.
								</li>
								<li>
									Connect to the database with any ODBC client when the import
									completes.
								</li>
							</ol>
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}

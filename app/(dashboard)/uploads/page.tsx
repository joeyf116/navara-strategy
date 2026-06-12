"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
	CheckCircle2,
	Clock,
	FileSpreadsheet,
	UploadCloud,
	XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Progress,
	ProgressLabel,
	ProgressValue,
} from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
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
				reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
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

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Excel Import"
				description="Upload an Excel file to import its rows into the database."
			/>

			{currentPhase === "done" && (
				<Card>
					<CardContent className="flex flex-col items-center gap-4 py-12">
						<CheckCircle2 className="size-10 text-success" aria-hidden="true" />
						<div className="text-center">
							<p className="text-lg font-semibold">Import complete</p>
							{jobData?.job?.rowCount != null && (
								<p className="mt-1 text-sm text-muted-foreground">
									{jobData.job.rowCount.toLocaleString()} rows imported from{" "}
									<span className="font-medium text-foreground">
										{selectedFile?.name}
									</span>
									.
								</p>
							)}
							<p className="mt-1 text-sm text-muted-foreground">
								Database connection details are available in{" "}
								<Link
									href="/settings"
									className="underline underline-offset-4 hover:text-foreground"
								>
									Settings
								</Link>
								.
							</p>
						</div>
						<Button onClick={reset}>Import another file</Button>
					</CardContent>
				</Card>
			)}

			{currentPhase === "error" && (
				<div className="flex flex-col gap-4">
					<Alert variant="destructive">
						<XCircle aria-hidden="true" />
						<AlertTitle>Import failed</AlertTitle>
						<AlertDescription>{currentErrorMessage}</AlertDescription>
					</Alert>
					<div>
						<Button variant="outline" onClick={reset}>
							Try again
						</Button>
					</div>
				</div>
			)}

			{currentPhase === "processing" && (
				<Card>
					<CardContent className="flex flex-col items-center gap-4 py-12">
						<Spinner className="size-8 text-primary" aria-hidden="true" />
						<div className="flex flex-col gap-1 text-center">
							<p className="text-lg font-semibold">Processing import</p>
							<p className="text-sm text-muted-foreground">
								Reading rows and writing them to the database. Large files can
								take several minutes — you can leave this page open.
							</p>
							{selectedFile && (
								<p className="text-sm text-muted-foreground">
									{selectedFile.name} ({formatBytes(selectedFile.size)})
								</p>
							)}
							{jobData?.job?.status === "pending" && (
								<div className="mt-2 flex justify-center">
									<Badge variant="outline">
										<Clock aria-hidden="true" />
										Queued for processing
									</Badge>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{currentPhase === "uploading" && (
				<Card>
					<CardContent className="flex flex-col items-center gap-6 py-12">
						<UploadCloud className="size-10 text-primary" aria-hidden="true" />
						<div className="w-full max-w-sm">
							<Progress value={uploadPct}>
								<ProgressLabel className="truncate">
									Uploading {selectedFile?.name}
								</ProgressLabel>
								<ProgressValue />
							</Progress>
						</div>
					</CardContent>
				</Card>
			)}

			{currentPhase === "presigning" && (
				<Card>
					<CardContent className="flex flex-col items-center gap-4 py-12">
						<Spinner className="size-8 text-primary" aria-hidden="true" />
						<p className="text-sm text-muted-foreground">Preparing upload…</p>
					</CardContent>
				</Card>
			)}

			{currentPhase === "idle" && (
				<div className="flex flex-col gap-4">
					<div
						className={`flex flex-col items-center gap-6 rounded-xl border-2 border-dashed px-6 py-14 transition-colors ${
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
						<FileSpreadsheet
							className="size-10 text-muted-foreground"
							aria-hidden="true"
						/>
						<div className="flex flex-col gap-1 text-center">
							<p className="text-lg font-semibold">
								Drop your Excel file here
							</p>
							<p className="text-sm text-muted-foreground">
								Accepts .xlsx and .xls files up to 1 GB.
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
							<UploadCloud data-icon="inline-start" aria-hidden="true" />
							Select file
						</Button>
					</div>

					<div className="flex flex-col gap-1 text-sm text-muted-foreground">
						<p className="font-medium text-foreground">How it works</p>
						<ol className="list-inside list-decimal flex flex-col gap-1">
							<li>Select or drop an Excel file (.xlsx or .xls, up to 1 GB).</li>
							<li>The file uploads securely and is processed automatically.</li>
							<li>
								Each row is imported into the database. You can track progress
								on this page.
							</li>
							<li>
								When the import completes, the data is ready to query — find
								connection details in{" "}
								<Link
									href="/settings"
									className="underline underline-offset-4 hover:text-foreground"
								>
									Settings
								</Link>
								.
							</li>
						</ol>
					</div>
				</div>
			)}
		</div>
	);
}

"use client";

import { Upload, Loader2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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

type SharedFile = {
	id: string;
	original_name: string;
	size_bytes: number;
	uploaded_by: string;
	uploaded_at: string;
};

type Status = { message: string; error: boolean } | null;

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function formatUploadedAt(value: string) {
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

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileShareHub({ initialFiles }: { initialFiles: SharedFile[] }) {
	const queryClient = useQueryClient();
	const [uploadedBy, setUploadedBy] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [status, setStatus] = useState<Status>(null);

	const { data: files = [] } = useQuery<SharedFile[]>({
		queryKey: ["shared-files"],
		initialData: initialFiles,
		queryFn: async () => {
			const response = await fetch("/api/files");
			const payload = (await response.json().catch(() => ({}))) as {
				files?: SharedFile[];
				error?: string;
			};
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to load files.");
			}
			return payload.files ?? [];
		},
	});

	const uploadMutation = useMutation({
		mutationFn: async (payload: { file: File; uploadedBy: string }) => {
			const formData = new FormData();
			formData.append("file", payload.file);
			formData.append("uploadedBy", payload.uploadedBy);

			const response = await fetch("/api/files", {
				method: "POST",
				body: formData,
			});
			const body = (await response.json().catch(() => ({}))) as {
				error?: string;
				file?: SharedFile;
			};
			if (!response.ok || !body.file) {
				throw new Error(body.error ?? "Upload failed");
			}
			return body.file;
		},
		onSuccess: async (file) => {
			setStatus({ message: `Uploaded ${file.original_name}.`, error: false });
			setSelectedFile(null);
			await queryClient.invalidateQueries({ queryKey: ["shared-files"] });
			const fileInput = document.getElementById(
				"share-file",
			) as HTMLInputElement | null;
			if (fileInput) fileInput.value = "";
		},
		onError: (error) => {
			setStatus({
				message: error instanceof Error ? error.message : "Upload failed",
				error: true,
			});
		},
	});

	const totalShared = useMemo(() => files.length, [files]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!selectedFile || !uploadedBy.trim()) {
			setStatus({ message: "Provide your name and choose a file.", error: true });
			return;
		}

		if (selectedFile.size === 0 || selectedFile.size > MAX_UPLOAD_BYTES) {
			setStatus({ message: "File must be between 1 byte and 1 GB.", error: true });
			return;
		}

		setStatus(null);
		await uploadMutation.mutateAsync({
			file: selectedFile,
			uploadedBy: uploadedBy.trim(),
		});
	}

	return (
		<main className="min-h-screen bg-background">
			<div className="container mx-auto max-w-4xl px-4 py-6">
				<div className="mb-6">
					<h1 className="text-2xl font-semibold tracking-tight">
						Navara File Share Hub
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Upload and track shared files in one place.
					</p>
				</div>

				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Upload a file</CardTitle>
							<CardDescription>
								Maximum file size:{" "}
								<span className="font-medium text-foreground">1 GB</span>
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form className="space-y-4" onSubmit={handleSubmit}>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label htmlFor="share-uploaded-by">Your name</Label>
										<Input
											id="share-uploaded-by"
											name="uploadedBy"
											placeholder="Client name"
											value={uploadedBy}
											onChange={(event) => setUploadedBy(event.target.value)}
											required
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="share-file">File</Label>
										<Input
											id="share-file"
											name="file"
											type="file"
											onChange={(event) =>
												setSelectedFile(event.target.files?.[0] ?? null)
											}
											required
										/>
									</div>
								</div>

								{status ? (
									<Alert variant={status.error ? "destructive" : "default"}>
										<AlertDescription>{status.message}</AlertDescription>
									</Alert>
								) : null}

								<div className="flex items-center justify-between gap-4">
									<p className="text-sm text-muted-foreground">
										{totalShared} file{totalShared === 1 ? "" : "s"} shared
									</p>
									<Button
										type="submit"
										disabled={uploadMutation.isPending}
									>
										{uploadMutation.isPending ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<Upload className="mr-2 h-4 w-4" />
										)}
										{uploadMutation.isPending ? "Uploading..." : "Upload"}
									</Button>
								</div>
							</form>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Recent uploads</CardTitle>
						</CardHeader>
						<CardContent className="px-0 pb-0">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>File</TableHead>
										<TableHead>Uploaded by</TableHead>
										<TableHead>Size</TableHead>
										<TableHead>Uploaded at</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{files.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={4}
												className="py-10 text-center text-sm text-muted-foreground"
											>
												No files uploaded yet.
											</TableCell>
										</TableRow>
									) : (
										files.map((file) => (
											<TableRow key={file.id}>
												<TableCell className="font-medium">
													{file.original_name}
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{file.uploaded_by}
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{formatSize(file.size_bytes)}
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{formatUploadedAt(file.uploaded_at)}
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</div>
			</div>
		</main>
	);
}

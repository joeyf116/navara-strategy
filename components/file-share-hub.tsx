"use client";

import { Upload, Loader2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export function FileShareHub({ initialFiles }: { initialFiles: SharedFile[] }) {
	const queryClient = useQueryClient();
	const [uploadedBy, setUploadedBy] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [status, setStatus] = useState("");

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
			setStatus(`Uploaded ${file.original_name}.`);
			setSelectedFile(null);
			await queryClient.invalidateQueries({ queryKey: ["shared-files"] });
			const fileInput = document.getElementById(
				"file",
			) as HTMLInputElement | null;
			if (fileInput) fileInput.value = "";
		},
		onError: (error) => {
			setStatus(error instanceof Error ? error.message : "Upload failed");
		},
	});

	const totalShared = useMemo(() => files.length, [files]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!selectedFile || !uploadedBy.trim()) {
			setStatus("Provide your name and choose a file.");
			return;
		}

		if (selectedFile.size === 0 || selectedFile.size > MAX_UPLOAD_BYTES) {
			setStatus("File must be between 1 byte and 1024MB.");
			return;
		}

		setStatus("");
		await uploadMutation.mutateAsync({
			file: selectedFile,
			uploadedBy: uploadedBy.trim(),
		});
	}

	return (
		<main className="min-h-screen bg-background px-4 py-6 text-foreground">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
				<Card>
					<CardHeader className="pb-3">
						<CardTitle>Navara File Share Hub</CardTitle>
						<CardDescription>
							Upload and track shared files in one place.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<form
							className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
							onSubmit={handleSubmit}
						>
							<Input
								name="uploadedBy"
								aria-label="Uploader name"
								placeholder="Client name"
								value={uploadedBy}
								onChange={(event) => setUploadedBy(event.target.value)}
								required
							/>
							<Input
								id="file"
								name="file"
								aria-label="File to upload"
								type="file"
								onChange={(event) =>
									setSelectedFile(event.target.files?.[0] ?? null)
								}
								required
							/>
							<Button
								type="submit"
								size="sm"
								disabled={uploadMutation.isPending}
							>
								<Upload className="h-4 w-4" />
								{uploadMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : null}
								{uploadMutation.isPending ? "Uploading..." : "Upload"}
							</Button>
						</form>
						<p className="text-xs text-muted-foreground">
							Shared files:{" "}
							<span className="font-medium text-foreground">{totalShared}</span>
						</p>
						<p className="text-xs text-muted-foreground">
							Maximum file size:{" "}
							<span className="font-medium text-foreground">1 GB</span>
						</p>
						{status ? (
							<p className="text-xs text-muted-foreground">{status}</p>
						) : null}
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-3">
						<CardTitle>Recent uploads</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="h-8 text-xs">File</TableHead>
									<TableHead className="h-8 text-xs">Uploaded by</TableHead>
									<TableHead className="h-8 text-xs">Size</TableHead>
									<TableHead className="h-8 text-xs">Uploaded at</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{files.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={4}
											className="py-4 text-xs text-muted-foreground"
										>
											No files uploaded yet.
										</TableCell>
									</TableRow>
								) : (
									files.map((file) => (
										<TableRow key={file.id}>
											<TableCell className="py-2 text-sm">
												{file.original_name}
											</TableCell>
											<TableCell className="py-2 text-xs text-muted-foreground">
												{file.uploaded_by}
											</TableCell>
											<TableCell className="py-2 text-xs text-muted-foreground">
												{Math.max(1, Math.round(file.size_bytes / 1024))} KB
											</TableCell>
											<TableCell className="py-2 text-xs text-muted-foreground">
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
		</main>
	);
}

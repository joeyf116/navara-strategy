"use client";

import { Upload } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

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

export function FileShareHub({ initialFiles }: { initialFiles: SharedFile[] }) {
	const [files, setFiles] = useState<SharedFile[]>(initialFiles);
	const [uploadedBy, setUploadedBy] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [status, setStatus] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const totalShared = useMemo(() => files.length, [files]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!selectedFile || !uploadedBy.trim()) {
			setStatus("Provide your name and choose a file.");
			return;
		}

		setStatus("");
		setIsLoading(true);

		const formData = new FormData();
		formData.append("file", selectedFile);
		formData.append("uploadedBy", uploadedBy.trim());

		try {
			const response = await fetch("/api/files", {
				method: "POST",
				body: formData,
			});
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload.error ?? "Upload failed");
			}

			setFiles((current) => [payload.file as SharedFile, ...current]);
			setSelectedFile(null);
			setStatus(`Uploaded ${payload.file.original_name}.`);

			const fileInput = document.getElementById(
				"file",
			) as HTMLInputElement | null;
			if (fileInput) {
				fileInput.value = "";
			}
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Upload failed");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<main className="min-h-screen bg-background px-4 py-10 text-foreground">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Navara File Share Hub</CardTitle>
						<CardDescription>
							Upload documents, then share through your SFTP workflow in AWS
							Transfer Family.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<form
							className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
							onSubmit={handleSubmit}
						>
							<Input
								aria-label="Uploader name"
								placeholder="Client name"
								value={uploadedBy}
								onChange={(event) => setUploadedBy(event.target.value)}
								required
							/>
							<Input
								id="file"
								aria-label="File to upload"
								type="file"
								onChange={(event) =>
									setSelectedFile(event.target.files?.[0] ?? null)
								}
								required
							/>
							<Button type="submit" disabled={isLoading}>
								<Upload className="h-4 w-4" />
								{isLoading ? "Uploading..." : "Upload"}
							</Button>
						</form>
						<p className="text-sm text-muted-foreground">
							Shared files:{" "}
							<span className="font-medium text-foreground">{totalShared}</span>
						</p>
						{status ? (
							<p className="text-sm text-muted-foreground">{status}</p>
						) : null}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Recent uploads</CardTitle>
					</CardHeader>
					<CardContent>
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
										<TableCell colSpan={4}>No files uploaded yet.</TableCell>
									</TableRow>
								) : (
									files.map((file) => (
										<TableRow key={file.id}>
											<TableCell>{file.original_name}</TableCell>
											<TableCell>{file.uploaded_by}</TableCell>
											<TableCell>
												{Math.max(1, Math.round(file.size_bytes / 1024))} KB
											</TableCell>
											<TableCell>
												{new Date(file.uploaded_at).toLocaleString()}
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

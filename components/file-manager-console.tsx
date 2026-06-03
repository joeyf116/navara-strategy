"use client";

import { useEffect, useMemo, useState } from "react";
import { Folder, FileText, MoreHorizontal, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function FileManagerConsole() {
	const [currentPath, setCurrentPath] = useState("/");
	const [entries, setEntries] = useState<Entry[]>([]);
	const [loading, setLoading] = useState(false);
	const [status, setStatus] = useState("");
	const [uploadProgress, setUploadProgress] = useState<number | null>(null);

	async function load(path: string) {
		setLoading(true);
		setStatus("");

		try {
			const response = await fetch(
				`/api/files/tree?path=${encodeURIComponent(path)}`,
			);
			const payload = (await response.json()) as {
				entries?: Entry[];
				error?: string;
			};

			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to load directory.");
			}

			setCurrentPath(path);
			setEntries(payload.entries ?? []);
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : "Failed to load directory.",
			);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		const id = window.setTimeout(() => {
			void load("/");
		}, 0);

		return () => {
			window.clearTimeout(id);
		};
	}, []);

	const breadcrumbs = useMemo(() => {
		const segments = currentPath.split("/").filter(Boolean);
		const parts = [{ label: "Root", path: "/" }];

		for (let i = 0; i < segments.length; i += 1) {
			parts.push({
				label: segments[i],
				path: `/${segments.slice(0, i + 1).join("/")}`,
			});
		}

		return parts;
	}, [currentPath]);

	async function createFolder() {
		const name = window.prompt("Folder name");
		if (!name) return;

		const response = await fetch("/api/files/tree", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "createFolder", path: currentPath, name }),
		});

		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
		};
		if (!response.ok) {
			setStatus(payload.error ?? "Failed to create folder.");
			return;
		}

		await load(currentPath);
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
					await load(currentPath);
				} else {
					setStatus("Upload failed.");
				}
				resolve();
			};

			xhr.onerror = () => {
				setUploadProgress(null);
				setStatus("Upload failed.");
				resolve();
			};

			const formData = new FormData();
			formData.append("path", currentPath);
			formData.append("file", file);
			xhr.send(formData);
		});
	}

	async function renameEntry(entry: Entry) {
		const name = window.prompt("New name", entry.name);
		if (!name || name === entry.name) return;

		const response = await fetch("/api/files/tree", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: entry.id, name }),
		});

		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
		};
		if (!response.ok) {
			setStatus(payload.error ?? "Rename failed.");
			return;
		}

		await load(currentPath);
	}

	async function deleteEntry(entry: Entry) {
		const confirmed = window.confirm(`Delete ${entry.name}?`);
		if (!confirmed) return;

		const response = await fetch(
			`/api/files/tree?id=${encodeURIComponent(entry.id)}`,
			{
				method: "DELETE",
			},
		);

		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
		};
		if (!response.ok) {
			setStatus(payload.error ?? "Delete failed.");
			return;
		}

		await load(currentPath);
	}

	async function shareEntry(entry: Entry) {
		const email = window.prompt("Share with email");
		if (!email) return;

		const canWrite = window.confirm("Allow write access?");
		const response = await fetch("/api/files/tree", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "share",
				nodeId: entry.id,
				granteeEmail: email,
				canWrite,
			}),
		});

		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
		};
		if (!response.ok) {
			setStatus(payload.error ?? "Share failed.");
			return;
		}

		setStatus(`Shared ${entry.name} with ${email}.`);
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">File Console</h1>
				<p className="text-muted-foreground">
					Manage files in My Files and Shared with Me. Changes sync to WebDAV.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Directory</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex flex-wrap items-center gap-2 text-sm">
						{breadcrumbs.map((crumb) => (
							<Button
								key={crumb.path}
								variant="outline"
								size="sm"
								onClick={() => void load(crumb.path)}
							>
								{crumb.label}
							</Button>
						))}
					</div>

					<div className="flex flex-wrap gap-2">
						<Button variant="outline" onClick={() => void load("/My Files")}>
							My Files
						</Button>
						<Button
							variant="outline"
							onClick={() => void load("/Shared with Me")}
						>
							Shared with Me
						</Button>
						<Button onClick={() => void createFolder()}>New Folder</Button>
						<label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
							<Upload className="h-4 w-4" />
							Upload
							<Input
								className="hidden"
								type="file"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file) {
										void uploadFile(file);
									}
									event.currentTarget.value = "";
								}}
							/>
						</label>
					</div>

					{uploadProgress !== null ? (
						<div className="h-2 w-full rounded bg-muted">
							<div
								className="h-full rounded bg-primary transition-all"
								style={{ width: `${uploadProgress}%` }}
							/>
						</div>
					) : null}

					{status ? (
						<p className="text-sm text-muted-foreground">{status}</p>
					) : null}

					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Owner</TableHead>
								<TableHead>Modified</TableHead>
								<TableHead>Size</TableHead>
								<TableHead className="w-[60px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{loading ? (
								<TableRow>
									<TableCell colSpan={5}>Loading...</TableCell>
								</TableRow>
							) : entries.length === 0 ? (
								<TableRow>
									<TableCell colSpan={5}>This folder is empty.</TableCell>
								</TableRow>
							) : (
								entries.map((entry) => (
									<TableRow key={entry.id}>
										<TableCell>
											<button
												className="flex items-center gap-2 text-left"
												onClick={() => {
													if (entry.kind === "folder") {
														void load(entry.virtualPath);
													}
												}}
											>
												{entry.kind === "folder" ? (
													<Folder className="h-4 w-4 text-muted-foreground" />
												) : (
													<FileText className="h-4 w-4 text-muted-foreground" />
												)}
												{entry.name}
											</button>
										</TableCell>
										<TableCell>{entry.ownerEmail}</TableCell>
										<TableCell>
											{new Date(entry.updatedAt).toLocaleString()}
										</TableCell>
										<TableCell>
											{entry.kind === "file"
												? formatSize(entry.sizeBytes)
												: "-"}
										</TableCell>
										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="outline" size="sm">
														<MoreHorizontal className="h-4 w-4" />
													</Button>
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
													<DropdownMenuItem
														onClick={() => void renameEntry(entry)}
													>
														Rename
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => void deleteEntry(entry)}
													>
														Delete
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => void shareEntry(entry)}
													>
														Share
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
	);
}

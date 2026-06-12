"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FolderTree } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SharedFile = {
	id: string;
	original_name: string;
	size_bytes: number;
	uploaded_by: string;
	uploaded_at: string;
};

function formatSize(bytes: number) {
	if (bytes === 0) return "—";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatUploadedAt(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

export function RecentFilesCard() {
	const { data, isLoading, isError, refetch } = useQuery<{
		files: SharedFile[];
	}>({
		queryKey: ["dashboard-recent-files"],
		queryFn: async () => {
			const response = await fetch("/api/files");
			if (!response.ok) throw new Error("Could not load files.");
			return response.json();
		},
	});

	const recent = (data?.files ?? [])
		.slice()
		.sort(
			(a, b) =>
				new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
		)
		.slice(0, 5);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Recent files</CardTitle>
				<CardDescription>Latest uploads you have access to.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{isLoading ? (
					<div className="flex flex-col gap-2">
						{Array.from({ length: 4 }).map((_, i) => (
							<Skeleton key={i} className="h-9 w-full" />
						))}
					</div>
				) : isError ? (
					<ErrorState
						title="Unable to load files"
						description="Something went wrong while loading recent files."
						onRetry={() => void refetch()}
					/>
				) : recent.length === 0 ? (
					<EmptyState
						icon={FolderTree}
						title="No files yet"
						description="Files shared with you or uploaded by you will appear here."
					/>
				) : (
					<ul className="flex flex-col divide-y divide-border">
						{recent.map((file) => (
							<li
								key={file.id}
								className="flex items-center justify-between gap-3 py-2 text-sm"
							>
								<div className="flex min-w-0 flex-col">
									<span className="truncate font-medium">
										{file.original_name}
									</span>
									<span className="truncate text-xs text-muted-foreground">
										{file.uploaded_by} · {formatUploadedAt(file.uploaded_at)}
									</span>
								</div>
								<span className="shrink-0 text-xs text-muted-foreground">
									{formatSize(file.size_bytes)}
								</span>
							</li>
						))}
					</ul>
				)}
				<Button
					variant="ghost"
					size="sm"
					className="self-start"
					nativeButton={false}
					render={<Link href="/files" />}
				>
					Browse all files
					<ArrowRight data-icon="inline-end" aria-hidden="true" />
				</Button>
			</CardContent>
		</Card>
	);
}

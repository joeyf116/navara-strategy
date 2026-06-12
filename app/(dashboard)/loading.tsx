import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<Skeleton className="h-7 w-48" />
				<Skeleton className="h-4 w-72" />
			</div>
			<div className="flex flex-col gap-3">
				<Skeleton className="h-8 w-full max-w-md" />
				<Skeleton className="h-64 w-full rounded-xl" />
			</div>
		</div>
	);
}

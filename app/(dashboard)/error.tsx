"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function DashboardError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// Surface for diagnostics without exposing details to the user.
		console.error(error);
	}, [error]);

	return (
		<EmptyState
			icon={AlertCircle}
			title="Something went wrong"
			description="An unexpected error occurred while loading this page. Try again, and contact support if the problem continues."
			action={
				<Button variant="outline" onClick={reset}>
					Try again
				</Button>
			}
			className="min-h-[50vh]"
		/>
	);
}

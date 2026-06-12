"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ErrorStateProps = {
	title?: string;
	description?: string;
	onRetry?: () => void;
	retryLabel?: string;
	className?: string;
};

export function ErrorState({
	title = "Something went wrong",
	description = "We could not load this data. Try again, and contact support if the problem continues.",
	onRetry,
	retryLabel = "Try again",
	className,
}: ErrorStateProps) {
	return (
		<div className={className}>
			<Alert variant="destructive">
				<AlertCircle aria-hidden="true" />
				<AlertTitle>{title}</AlertTitle>
				<AlertDescription>
					<p>{description}</p>
					{onRetry ? (
						<Button
							variant="outline"
							size="sm"
							className="mt-2"
							onClick={onRetry}
						>
							<RefreshCw data-icon="inline-start" aria-hidden="true" />
							{retryLabel}
						</Button>
					) : null}
				</AlertDescription>
			</Alert>
		</div>
	);
}

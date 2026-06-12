"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type CopyFieldProps = {
	label: string;
	value: string;
	/** Show a skeleton instead of an empty input while the value loads. */
	loading?: boolean;
};

export function CopyField({ label, value, loading = false }: CopyFieldProps) {
	const [copied, setCopied] = useState(false);

	function copy() {
		if (!value) return;
		void navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<div className="flex flex-col gap-1.5">
			<Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{label}
			</Label>
			{loading ? (
				<Skeleton className="h-8 w-full" />
			) : (
				<div className="flex gap-2">
					<Input readOnly value={value} className="font-mono text-sm" />
					<Button
						variant="outline"
						size="icon"
						onClick={copy}
						disabled={!value}
						aria-label={`Copy ${label}`}
					>
						{copied ? (
							<Check className="text-success" aria-hidden="true" />
						) : (
							<Copy aria-hidden="true" />
						)}
					</Button>
				</div>
			)}
		</div>
	);
}

import Link from "next/link";
import { ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

type AccessDeniedProps = {
	description?: string;
};

export function AccessDenied({
	description = "You don't have permission to view this page. Contact an administrator if you believe this is a mistake.",
}: AccessDeniedProps) {
	return (
		<EmptyState
			icon={ShieldX}
			title="Access denied"
			description={description}
			action={
				<Button
					variant="outline"
					nativeButton={false}
					render={<Link href="/" />}
				>
					Back to dashboard
				</Button>
			}
		/>
	);
}

import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4">
			<EmptyState
				icon={FileQuestion}
				title="Page not found"
				description="The page you are looking for does not exist or may have moved."
				action={
					<Button render={<Link href="/files" />}>Go to Files</Button>
				}
			/>
		</main>
	);
}

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getJob } from "@/lib/excel-upload";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const session = await auth();
	if (!session?.user?.email) {
		return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
	}

	const { jobId } = await params;
	if (!jobId?.trim()) {
		return NextResponse.json({ error: "jobId is required." }, { status: 400 });
	}

	try {
		const job = await getJob(jobId);

		if (!job) {
			return NextResponse.json({ error: "Job not found." }, { status: 404 });
		}

		// Only the creator or admins may view job status.
		const role = session.user.role;
		if (
			job.createdBy !== session.user.email &&
			role !== "super_admin" &&
			role !== "admin"
		) {
			return NextResponse.json({ error: "Forbidden." }, { status: 403 });
		}

		return NextResponse.json({ job });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to retrieve job status.",
			},
			{ status: 500 },
		);
	}
}

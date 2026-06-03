import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ callbackUrl?: string }>;
}) {
	const session = await auth();
	if (session?.user) {
		redirect("/uploads");
	}

	const { callbackUrl } = await searchParams;
	const isDev =
		process.env.NODE_ENV !== "production" ||
		process.env.NEXT_PUBLIC_DEV_MODE === "true";
	const hasCognito = !!(
		process.env.AUTH_COGNITO_ID && process.env.AUTH_COGNITO_SECRET
	);

	return (
		<LoginForm
			isDev={isDev}
			hasCognito={hasCognito}
			callbackUrl={callbackUrl ?? "/uploads"}
		/>
	);
}

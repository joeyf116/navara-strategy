import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { FileShareHub } from "@/components/file-share-hub";
import { listSharedFiles } from "@/lib/files";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();

  if (!session?.user?.email || !session.user.role) {
    redirect("/login");
  }

  const initialFiles = await listSharedFiles({
    viewerEmail: session.user.email,
    viewerRole: session.user.role,
  });

  return <FileShareHub initialFiles={initialFiles} />;
}

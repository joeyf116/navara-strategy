import { FileShareHub } from "@/components/file-share-hub";
import { listSharedFiles } from "@/lib/files";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialFiles = await listSharedFiles();
  return <FileShareHub initialFiles={initialFiles} />;
}

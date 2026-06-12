import { redirect } from "next/navigation";

// Legacy share-hub route. The file workspace at /files replaced it; the
// /api/files endpoints it used remain available for existing integrations.
export default function LegacyUploadPage() {
	redirect("/files");
}

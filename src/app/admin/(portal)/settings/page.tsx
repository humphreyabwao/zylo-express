import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader, PendingModule } from "@/components/admin/primitives";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="Settings" />
      <PendingModule label="Settings" />
    </>
  );
}

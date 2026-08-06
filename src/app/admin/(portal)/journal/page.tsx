import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader, PendingModule } from "@/components/admin/primitives";

export const metadata = { title: "Journal" };

export default async function AdminJournalPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="Journal" />
      <PendingModule label="Journal" />
    </>
  );
}

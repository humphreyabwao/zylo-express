import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader, PendingModule } from "@/components/admin/primitives";

export const metadata = { title: "Collections" };

export default async function AdminCollectionsPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="Collections" />
      <PendingModule label="Collections" />
    </>
  );
}

import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader, PendingModule } from "@/components/admin/primitives";

export const metadata = { title: "Inventory" };

export default async function AdminInventoryPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="Inventory" />
      <PendingModule label="Inventory" />
    </>
  );
}

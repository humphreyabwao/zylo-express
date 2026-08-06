import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader, PendingModule } from "@/components/admin/primitives";

export const metadata = { title: "Customers" };

export default async function AdminCustomersPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="Customers" />
      <PendingModule label="Customers" />
    </>
  );
}

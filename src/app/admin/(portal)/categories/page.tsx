import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader, PendingModule } from "@/components/admin/primitives";

export const metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="Categories" />
      <PendingModule label="Categories" />
    </>
  );
}

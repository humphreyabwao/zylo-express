import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader, PendingModule } from "@/components/admin/primitives";

export const metadata = { title: "New product" };

export default async function AdminNewProductPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader
        title="New product"
        description="The product editor is not built yet."
      />
      <PendingModule label="The product editor" />
    </>
  );
}

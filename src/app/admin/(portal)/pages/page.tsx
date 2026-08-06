import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader, PendingModule } from "@/components/admin/primitives";

export const metadata = { title: "Pages" };

export default async function AdminPagesPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="Pages" />
      <PendingModule label="Pages" />
    </>
  );
}

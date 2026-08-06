import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader, PendingModule } from "@/components/admin/primitives";

export const metadata = { title: "Media" };

export default async function AdminMediaPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="Media" />
      <PendingModule label="Media" />
    </>
  );
}

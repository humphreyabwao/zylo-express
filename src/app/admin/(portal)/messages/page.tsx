import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader, PendingModule } from "@/components/admin/primitives";

export const metadata = { title: "Messages" };

export default async function AdminMessagesPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="Messages" />
      <PendingModule label="Messages" />
    </>
  );
}

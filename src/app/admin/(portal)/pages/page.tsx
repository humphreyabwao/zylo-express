import { Plus } from "lucide-react";

import { requireAdmin } from "@/lib/admin/guard";
import { listContentPages, listContentSections } from "@/lib/admin/queries";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/primitives";
import { ListToolbar } from "@/components/admin/toolbar";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import { PageActions, PageCreateButton } from "@/components/admin/page-actions";

export const metadata = { title: "Pages" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function AdminPagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const filters = {
    search: read("q"),
    section: read("section"),
    status: (read("status") ?? "all") as "all" | "published" | "draft",
  };

  const [pages, sections] = await Promise.all([
    listContentPages(filters),
    listContentSections(),
  ]);

  const filtered = Boolean(
    filters.search || filters.section || filters.status !== "all"
  );

  return (
    <>
      <PageHeader
        title="Pages"
        description="Help centre and legal copy, served at /help and /legal."
      >
        <RealtimeRefresh channel="pages" label="pages" />
        <PageCreateButton>
          <Plus className="size-4" strokeWidth={2.2} />
          New page
        </PageCreateButton>
      </PageHeader>

      <Panel>
        <ListToolbar
          searchPlaceholder="Search by title or slug…"
          filters={[
            {
              name: "section",
              label: "Section",
              options: [
                { value: "", label: "All sections" },
                ...sections.map((section) => ({
                  value: section,
                  label: `/${section}`,
                })),
              ],
            },
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "published", label: "Published" },
                { value: "draft", label: "Unpublished" },
              ],
            },
          ]}
        />

        {pages.length === 0 ? (
          <EmptyState
            title={filtered ? "No pages match" : "No pages in the database"}
            description={
              filtered
                ? "Nothing matches these filters. Try widening them."
                : "The storefront is serving its built-in copy from src/data/content.ts. Create a page here and it takes over that URL; delete every page and the built-in copy returns."
            }
            action={
              !filtered && (
                <PageCreateButton>
                  <Plus className="size-4" strokeWidth={2.2} />
                  New page
                </PageCreateButton>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[38%]">Page</Th>
                <Th>Section</Th>
                <Th>Status</Th>
                <Th align="right">Sections</Th>
                <Th align="right">Updated</Th>
                <Th align="right" className="w-16">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {pages.map((page) => (
                <Tr key={page.id}>
                  <Td>
                    <span className="block truncate font-medium">{page.title}</span>
                    <span className="admin-figure block truncate text-[0.75rem] text-admin-faint">
                      /{page.section}/{page.slug}
                    </span>
                  </Td>

                  <Td>
                    <Badge tone="neutral">{page.section}</Badge>
                  </Td>

                  <Td>
                    <Badge tone={page.is_published ? "positive" : "neutral"}>
                      {page.is_published ? "Published" : "Unpublished"}
                    </Badge>
                  </Td>

                  <Td align="right">
                    <span
                      className={
                        page.body.length === 0
                          ? "admin-figure text-destructive"
                          : "admin-figure text-admin-muted"
                      }
                      title={
                        page.body.length === 0
                          ? "This page has no copy and will render empty"
                          : undefined
                      }
                    >
                      {page.body.length}
                    </span>
                  </Td>

                  <Td align="right" className="admin-figure text-admin-muted">
                    {DATE.format(new Date(page.updated_at))}
                  </Td>

                  <Td align="right">
                    <PageActions page={page} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}

import Image from "next/image";
import { Plus } from "lucide-react";

import { storageUrl } from "@/lib/storage";
import { requireAdmin } from "@/lib/admin/guard";
import { listArticles, normalisePage } from "@/lib/admin/queries";
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
import { Pagination } from "@/components/admin/pagination";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import {
  ArticleActions,
  ArticleCreateButton,
} from "@/components/admin/article-actions";

export const metadata = { title: "Journal" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function AdminJournalPage({
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
    page: normalisePage(read("page")),
    search: read("q"),
    status: (read("status") ?? "all") as
      | "all"
      | "published"
      | "draft"
      | "scheduled",
    sort: (read("sort") ?? "recent") as "recent" | "oldest" | "title",
  };

  const page = await listArticles(filters);
  const filtered = Boolean(filters.search || filters.status !== "all");

  return (
    <>
      <PageHeader
        title="Journal"
        description="Long-form editorial. Dated in the future to schedule."
      >
        <RealtimeRefresh channel="journal" label="the journal" />
        <ArticleCreateButton>
          <Plus className="size-4" strokeWidth={2.2} />
          New article
        </ArticleCreateButton>
      </PageHeader>

      <Panel>
        <ListToolbar
          searchPlaceholder="Search by title or slug…"
          filters={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "published", label: "Published" },
                { value: "scheduled", label: "Scheduled" },
                { value: "draft", label: "Draft" },
              ],
            },
            {
              name: "sort",
              label: "Sort",
              options: [
                { value: "", label: "Newest" },
                { value: "oldest", label: "Oldest" },
                { value: "title", label: "Title A–Z" },
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No articles match" : "The journal is empty"}
            description={
              filtered
                ? "Nothing matches these filters. Try widening them."
                : "The journal carries the house's editorial writing. Write the first piece to get started."
            }
            action={
              !filtered && (
                <ArticleCreateButton>
                  <Plus className="size-4" strokeWidth={2.2} />
                  New article
                </ArticleCreateButton>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[42%]">Article</Th>
                <Th>Status</Th>
                <Th>Author</Th>
                <Th align="right">Read</Th>
                <Th align="right">Date</Th>
                <Th align="right" className="w-16">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {page.rows.map((article) => (
                <Tr key={article.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg border border-admin-line bg-admin-hover">
                        {article.image_url && (
                          <Image
                            src={storageUrl(article.image_url)}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        )}
                      </span>

                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {article.title}
                        </span>
                        <span className="admin-figure block truncate text-[0.75rem] text-admin-faint">
                          {article.slug}
                        </span>
                      </span>
                    </div>
                  </Td>

                  <Td>
                    {article.status === "draft" ? (
                      <Badge tone="neutral">Draft</Badge>
                    ) : article.status === "scheduled" ? (
                      <Badge tone="warning">Scheduled</Badge>
                    ) : (
                      <Badge tone="positive">Published</Badge>
                    )}
                  </Td>

                  <Td>
                    <span className="truncate text-admin-muted">
                      {article.author}
                    </span>
                  </Td>

                  <Td align="right" className="admin-figure text-admin-muted">
                    {article.reading_minutes} min
                  </Td>

                  <Td align="right" className="admin-figure text-admin-muted">
                    {DATE.format(new Date(article.published_at))}
                  </Td>

                  <Td align="right">
                    <ArticleActions article={article} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          basePath="/admin/journal"
          label="articles"
          searchParams={{
            q: filters.search,
            status: read("status"),
            sort: read("sort"),
          }}
        />
      </Panel>
    </>
  );
}

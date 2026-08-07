import { Plus } from "lucide-react";

import { requireAdmin } from "@/lib/admin/guard";
import { listCategories, listCategoryGroups } from "@/lib/admin/queries";
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
import {
  CategoryActions,
  CategoryCreateButton,
} from "@/components/admin/category-actions";

export const metadata = { title: "Categories" };

export default async function AdminCategoriesPage({
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
    status: (read("status") ?? "all") as "all" | "active" | "draft",
    group: read("group"),
    sort: (read("sort") ?? "position") as "position" | "name" | "products",
  };

  const [categories, groups] = await Promise.all([
    listCategories(filters),
    listCategoryGroups(),
  ]);

  const filtered = Boolean(filters.search || filters.group || filters.status !== "all");

  return (
    <>
      <PageHeader
        title="Categories"
        description="The shop's navigation. Every product files under exactly one."
      >
        <RealtimeRefresh channel="categories" label="categories" />
        <CategoryCreateButton groups={groups}>
          <Plus className="size-4" strokeWidth={2.2} />
          New category
        </CategoryCreateButton>
      </PageHeader>

      <Panel>
        <ListToolbar
          searchPlaceholder="Search by name or slug…"
          filters={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "active", label: "Visible" },
                { value: "draft", label: "Hidden" },
              ],
            },
            {
              name: "group",
              label: "Group",
              options: [
                { value: "", label: "All groups" },
                ...groups.map((group) => ({ value: group, label: group })),
              ],
            },
            {
              name: "sort",
              label: "Sort",
              options: [
                { value: "", label: "Nav order" },
                { value: "name", label: "Name A–Z" },
                { value: "products", label: "Most products" },
              ],
            },
          ]}
        />

        {categories.length === 0 ? (
          <EmptyState
            title={filtered ? "No categories match" : "No categories yet"}
            description={
              filtered
                ? "Nothing matches these filters. Try widening them."
                : "Categories are how shoppers navigate the catalogue. Create the first one to get started."
            }
            action={
              !filtered && (
                <CategoryCreateButton groups={groups}>
                  <Plus className="size-4" strokeWidth={2.2} />
                  New category
                </CategoryCreateButton>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[34%]">Category</Th>
                <Th>Group</Th>
                <Th>Status</Th>
                <Th align="right">Products</Th>
                <Th align="right">Order</Th>
                <Th align="right" className="w-16">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {categories.map((category) => (
                <Tr key={category.id}>
                  <Td>
                    <span className="block truncate font-medium">
                      {category.name}
                    </span>
                    <span className="admin-figure block truncate text-[0.75rem] text-admin-faint">
                      {category.slug}
                    </span>
                  </Td>

                  <Td>
                    <span className="text-admin-muted">{category.group}</span>
                  </Td>

                  <Td>
                    <Badge tone={category.is_active ? "positive" : "neutral"}>
                      {category.is_active ? "Visible" : "Hidden"}
                    </Badge>
                  </Td>

                  <Td align="right">
                    <span
                      className={
                        category.product_count === 0
                          ? "admin-figure text-admin-faint"
                          : "admin-figure font-semibold text-admin-fg"
                      }
                    >
                      {category.product_count}
                    </span>
                  </Td>

                  <Td align="right" className="admin-figure text-admin-muted">
                    {category.position}
                  </Td>

                  <Td align="right">
                    <CategoryActions category={category} groups={groups} />
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

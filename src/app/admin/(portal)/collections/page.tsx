import Image from "next/image";
import { Plus, Star } from "lucide-react";

import { storageUrl } from "@/lib/storage";
import { requireAdmin } from "@/lib/admin/guard";
import { listCollections } from "@/lib/admin/queries";
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
  CollectionActions,
  CollectionCreateButton,
} from "@/components/admin/collection-actions";

export const metadata = { title: "Collections" };

export default async function AdminCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("collections");

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const filters = {
    search: read("q"),
    status: (read("status") ?? "all") as "all" | "active" | "draft",
    featured: (read("featured") ?? "all") as "all" | "featured" | "standard",
    sort: (read("sort") ?? "position") as "position" | "name" | "products",
  };

  const collections = await listCollections(filters);

  const filtered = Boolean(
    filters.search || filters.status !== "all" || filters.featured !== "all"
  );

  return (
    <>
      <PageHeader
        title="Collections"
      >
        <RealtimeRefresh channel="collections" />
        <CollectionCreateButton>
          <Plus className="size-4" strokeWidth={2.2} />
          New collection
        </CollectionCreateButton>
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
              name: "featured",
              label: "Placement",
              options: [
                { value: "", label: "All placements" },
                { value: "featured", label: "Featured" },
                { value: "standard", label: "Not featured" },
              ],
            },
            {
              name: "sort",
              label: "Sort",
              options: [
                { value: "", label: "Display order" },
                { value: "name", label: "Name A–Z" },
                { value: "products", label: "Most products" },
              ],
            },
          ]}
        />

        {collections.length === 0 ? (
          <EmptyState
            title={filtered ? "No collections match" : "No collections yet"}
            description={
              filtered
                ? "Nothing matches these filters. Try widening them."
                : "Create the first collection."
            }
            action={
              !filtered && (
                <CollectionCreateButton>
                  <Plus className="size-4" strokeWidth={2.2} />
                  New collection
                </CollectionCreateButton>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[38%]">Collection</Th>
                <Th>Status</Th>
                <Th>Placement</Th>
                <Th align="right">Products</Th>
                <Th align="right">Order</Th>
                <Th align="right" className="w-16">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {collections.map((collection) => (
                <Tr key={collection.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-admin-line bg-admin-hover">
                        {collection.image_url && (
                          <Image
                            src={storageUrl(collection.image_url)}
                            alt=""
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        )}
                      </span>

                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {collection.name}
                        </span>
                        <span className="admin-figure block truncate text-[0.75rem] text-admin-faint">
                          {collection.slug}
                        </span>
                      </span>
                    </div>
                  </Td>

                  <Td>
                    <Badge tone={collection.is_active ? "positive" : "neutral"}>
                      {collection.is_active ? "Visible" : "Hidden"}
                    </Badge>
                  </Td>

                  <Td>
                    {collection.is_featured ? (
                      <Badge tone="accent">
                        <Star className="size-3" strokeWidth={2.4} />
                        Featured
                      </Badge>
                    ) : (
                      <span className="text-[0.75rem] text-admin-faint">—</span>
                    )}
                  </Td>

                  <Td align="right">
                    <span
                      className={
                        collection.product_count === 0
                          ? "admin-figure text-admin-faint"
                          : "admin-figure font-semibold text-admin-fg"
                      }
                    >
                      {collection.product_count}
                    </span>
                  </Td>

                  <Td align="right" className="admin-figure text-admin-muted">
                    {collection.position}
                  </Td>

                  <Td align="right">
                    <CollectionActions collection={collection} />
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

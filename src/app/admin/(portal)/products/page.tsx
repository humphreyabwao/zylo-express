import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";

import { formatPrice } from "@/lib/utils";
import { storageUrl } from "@/lib/storage";
import { requireAdmin } from "@/lib/admin/guard";
import { listProducts, normalisePage, LOW_STOCK_THRESHOLD } from "@/lib/admin/queries";
import { getCategories } from "@/lib/catalog";
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

export const metadata = { title: "Products" };

export default async function AdminProductsPage({
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
    status: (read("status") ?? "all") as "all" | "active" | "draft",
    categorySlug: read("category"),
    sort: (read("sort") ?? "recent") as "recent" | "name" | "price-asc" | "price-desc",
  };

  const [page, categories] = await Promise.all([
    listProducts(filters),
    getCategories(),
  ]);

  return (
    <>
      <PageHeader
        title="Products"
        description="Create, price and publish everything in the catalogue."
      >
        <Link
          href="/admin/products/new"
          className="flex h-9 items-center gap-1.5 rounded-sm bg-admin-fg px-4 text-[0.8125rem] font-semibold text-admin-panel transition-opacity duration-200 hover:opacity-85"
        >
          <Plus className="size-4" strokeWidth={2.2} />
          New product
        </Link>
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
                { value: "active", label: "Published" },
                { value: "draft", label: "Draft" },
              ],
            },
            {
              name: "category",
              label: "Category",
              options: [
                { value: "", label: "All categories" },
                ...categories.map((c) => ({ value: c.slug, label: c.name })),
              ],
            },
            {
              name: "sort",
              label: "Sort",
              options: [
                { value: "", label: "Newest" },
                { value: "name", label: "Name A–Z" },
                { value: "price-desc", label: "Price, high to low" },
                { value: "price-asc", label: "Price, low to high" },
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title="No products match"
            description={
              filters.search || filters.categorySlug || filters.status !== "all"
                ? "Nothing matches these filters. Try widening them."
                : "The catalogue is empty. Create the first product to get started."
            }
            action={
              <Link
                href="/admin/products/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-admin-fg px-4 text-[0.8125rem] font-semibold text-admin-panel transition-opacity hover:opacity-85"
              >
                <Plus className="size-4" strokeWidth={2.2} />
                New product
              </Link>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[40%]">Product</Th>
                <Th>Status</Th>
                <Th align="right">Price</Th>
                <Th align="right">Variants</Th>
                <Th align="right">Stock</Th>
              </tr>
            </thead>

            <tbody>
              {page.rows.map((product) => {
                const outOfStock = product.stock <= 0;
                const lowStock =
                  !outOfStock && product.stock <= LOW_STOCK_THRESHOLD * 2;

                return (
                  <Tr key={product.id}>
                    <Td>
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="flex items-center gap-3 transition-opacity duration-200 hover:opacity-75"
                      >
                        <span className="relative size-10 shrink-0 overflow-hidden bg-admin-hover">
                          {product.image_path && (
                            <Image
                              src={storageUrl(product.image_path)}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          )}
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {product.name}
                          </span>
                          <span className="block truncate text-[0.75rem] text-admin-faint">
                            {product.slug}
                          </span>
                        </span>
                      </Link>
                    </Td>

                    <Td>
                      <Badge tone={product.is_active ? "positive" : "neutral"}>
                        {product.is_active ? "Published" : "Draft"}
                      </Badge>
                    </Td>

                    <Td align="right" className="admin-figure font-semibold">
                      {formatPrice(product.price)}
                      {product.compare_at_price && (
                        <span className="ml-1.5 font-normal text-admin-faint line-through">
                          {formatPrice(product.compare_at_price)}
                        </span>
                      )}
                    </Td>

                    <Td align="right" className="admin-figure text-admin-muted">
                      {product.variant_count}
                    </Td>

                    <Td align="right">
                      <span
                        className={
                          outOfStock
                            ? "admin-figure font-semibold text-destructive"
                            : lowStock
                              ? "admin-figure font-semibold text-champagne-dark"
                              : "admin-figure text-admin-muted"
                        }
                      >
                        {product.stock}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          basePath="/admin/products"
          label="products"
          searchParams={{
            q: filters.search,
            status: read("status"),
            category: filters.categorySlug,
            sort: read("sort"),
          }}
        />
      </Panel>
    </>
  );
}

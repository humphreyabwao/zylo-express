import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { storageUrl } from "@/lib/storage";
import { requireAdmin, createOperatorClient } from "@/lib/admin/guard";
import { LOW_STOCK_THRESHOLD, type ProductListRow } from "@/lib/admin/queries";
import {
  AdminButton,
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/primitives";
import { Money } from "@/components/admin/admin-currency";
import { ProductActions } from "@/components/admin/product-actions";
import {
  ProductImageManager,
  type AdminProductImage,
} from "@/components/admin/product-images";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import { VariantActions } from "@/components/admin/variant-actions";

export const metadata = { title: "Product" };

/**
 * Product detail.
 *
 * The variant table and imagery are read-only; the actions in the header are
 * not — publish, edit, duplicate and delete all work from here, sharing the
 * same menu the list view uses so an operator does not learn two vocabularies
 * for the same operations.
 *
 * Deep editing — variants, options, image ordering — is still ahead. What is
 * here is truthful about that rather than showing disabled controls.
 */
export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin("products");
  const { id } = await params;

  const supabase = await createOperatorClient();
  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!product) notFound();

  const [{ data: variants }, { data: imageRows }] = await Promise.all([
    supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", id)
      .order("sku", { ascending: true }),
    supabase
      .from("product_images")
      .select("*")
      .eq("product_id", id)
      .order("position", { ascending: true }),
  ]);

  const rows = variants ?? [];
  const stock = rows.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0);

  // `storageUrl` is server-only, so URLs are resolved here rather than in the
  // client components that render them.
  const images: AdminProductImage[] = (imageRows ?? []).map((image) => ({
    ...image,
    url: storageUrl(image.storage_path),
  }));

  // The action menu takes a list row, so the extra fields it needs are derived
  // here rather than the menu learning a second shape for the same product.
  const listRow: ProductListRow = {
    ...product,
    variant_count: rows.length,
    stock,
    image_path: images[0]?.storage_path ?? null,
  };

  return (
    <>
      <PageHeader title={product.name} description={product.tagline}>
        <RealtimeRefresh channel="inventory" />
        <Badge tone={product.is_active ? "positive" : "neutral"}>
          {product.is_active ? "Published" : "Draft"}
        </Badge>
        <AdminButton variant="secondary" href="/admin/products">
          <ArrowLeft className="size-4" strokeWidth={2} />
          All products
        </AdminButton>
        <ProductActions product={listRow} images={images} />
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <Panel>
          <PanelHeader
            title={`Variants (${rows.length})`}
            description={`${stock} units in stock across every option`}
          />

          {rows.length === 0 ? (
            <EmptyState
              title="No variants"
              description="This product has no purchasable options yet, so nothing can be added to a bag."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>SKU</Th>
                  <Th>Variant</Th>
                  <Th>Status</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Stock</Th>
                  <Th align="right" className="w-16">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((variant) => {
                  const out = variant.inventory_quantity <= 0;
                  const low = !out && variant.inventory_quantity <= LOW_STOCK_THRESHOLD;

                  return (
                    <Tr key={variant.id}>
                      <Td className="admin-figure font-medium">{variant.sku}</Td>
                      <Td className="text-admin-muted">{variant.title}</Td>
                      <Td>
                        {/* Derived from stock by a trigger, so this reports
                            rather than being independently set. */}
                        <Badge tone={out ? "critical" : low ? "warning" : "positive"}>
                          {out ? "Sold out" : low ? "Low" : "In stock"}
                        </Badge>
                      </Td>
                      <Td align="right" className="admin-figure font-semibold">
                        <Money amount={variant.price} />
                        {variant.compare_at_price && (
                          <span className="ml-1.5 font-normal text-admin-faint line-through">
                            <Money amount={variant.compare_at_price} />
                          </span>
                        )}
                      </Td>
                      <Td align="right">
                        <span
                          className={
                            out
                              ? "admin-figure font-semibold text-destructive"
                              : low
                                ? "admin-figure font-semibold text-champagne-dark"
                                : "admin-figure text-admin-muted"
                          }
                        >
                          {variant.inventory_quantity}
                        </span>
                      </Td>
                      <Td align="right">
                        <VariantActions variant={variant} images={images} />
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel className="p-5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-admin-faint">
              Price
            </p>
            <p className="admin-figure mt-2 flex items-baseline gap-2 text-[1.5rem] font-semibold">
              <Money amount={product.price} />
              {product.compare_at_price && (
                <span className="text-[0.875rem] font-normal text-admin-faint line-through">
                  <Money amount={product.compare_at_price} />
                </span>
              )}
            </p>

            <dl className="mt-4 space-y-2 border-t border-admin-line pt-4 text-[0.75rem]">
              <Detail label="Slug" value={product.slug} mono />
              <Detail label="Category" value={product.category_slug ?? "—"} />
              <Detail label="Origin" value={product.origin_label || "—"} />
              <Detail
                label="Featured"
                value={product.is_featured ? "Yes" : "No"}
              />
            </dl>
          </Panel>

          <Panel>
            <PanelHeader
              title={`Imagery (${images.length})`}
              description="First image leads on cards and in the bag"
            />
            <ProductImageManager productId={product.id} images={images} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-admin-faint">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right font-medium text-admin-fg ${
          mono ? "admin-figure" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

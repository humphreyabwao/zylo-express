import { notFound } from "next/navigation";

import { formatPrice } from "@/lib/utils";
import { requireAdmin, createOperatorClient } from "@/lib/admin/guard";
import {
  Badge,
  PageHeader,
  Panel,
  PanelHeader,
  PendingModule,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/primitives";

export const metadata = { title: "Product" };

/**
 * Product detail.
 *
 * Read-only for now: the variant table below is real, but editing, pricing and
 * image management are not built. Shipping it read-only rather than not at all
 * means the id in the URL resolves to something truthful, and the list view's
 * links are not dead.
 */
export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const supabase = await createOperatorClient();
  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!product) notFound();

  const { data: variants } = await supabase
    .from("product_variants")
    .select("*")
    .eq("product_id", id)
    .order("sku", { ascending: true });

  return (
    <>
      <PageHeader title={product.name} description={product.tagline}>
        <Badge tone={product.is_active ? "positive" : "neutral"}>
          {product.is_active ? "Published" : "Draft"}
        </Badge>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <Panel>
          <PanelHeader title={`Variants (${variants?.length ?? 0})`} />

          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Variant</Th>
                <Th align="right">Price</Th>
                <Th align="right">Stock</Th>
              </tr>
            </thead>
            <tbody>
              {(variants ?? []).map((variant) => (
                <Tr key={variant.id}>
                  <Td className="admin-figure font-medium">{variant.sku}</Td>
                  <Td className="text-admin-muted">{variant.title}</Td>
                  <Td align="right" className="admin-figure font-semibold">
                    {formatPrice(variant.price)}
                  </Td>
                  <Td align="right">
                    <span
                      className={
                        variant.inventory_quantity <= 0
                          ? "admin-figure font-semibold text-destructive"
                          : "admin-figure text-admin-muted"
                      }
                    >
                      {variant.inventory_quantity}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-admin-faint">
              Price
            </p>
            <p className="admin-figure mt-2 text-[1.5rem] font-semibold">
              {formatPrice(product.price)}
            </p>
            <p className="mt-3 text-[0.75rem] text-admin-faint">
              {product.slug}
            </p>
          </Panel>

          <PendingModule label="Editing" />
        </div>
      </div>
    </>
  );
}

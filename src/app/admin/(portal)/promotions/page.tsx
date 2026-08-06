import { formatDate, formatPrice } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin/guard";
import {
  listPromotions,
  normalisePage,
  type PromotionState,
} from "@/lib/admin/queries";
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
import { Pagination } from "@/components/admin/pagination";

export const metadata = { title: "Promotions" };

const STATE_LABEL: Record<PromotionState, string> = {
  live: "Live",
  paused: "Paused",
  scheduled: "Scheduled",
  ended: "Ended",
  exhausted: "Exhausted",
};

/** A discount is expressed differently per kind; one place decides how. */
function describeValue(kind: string, value: number) {
  if (kind === "percentage") return `${value}% off`;
  if (kind === "fixed") return `${formatPrice(value)} off`;
  return "Free shipping";
}

export default async function AdminPromotionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = await listPromotions({ page: normalisePage(pageParam) });

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Discount codes, what they are worth, and how far they have been used."
      />

      <Panel>
        {page.rows.length === 0 ? (
          <EmptyState
            title="No promotions"
            description="Discount codes will appear here once created."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Value</Th>
                <Th>Minimum</Th>
                <Th>Window</Th>
                <Th align="right">Used</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>

            <tbody>
              {page.rows.map((promotion) => {
                const live = promotion.state === "live";

                return (
                  <Tr key={promotion.id}>
                    <Td className="font-semibold tracking-wide">{promotion.code}</Td>

                    <Td className="text-admin-muted">
                      {describeValue(promotion.kind, promotion.value)}
                      <span className="block text-[0.75rem] text-admin-faint">
                        {promotion.label}
                      </span>
                    </Td>

                    <Td className="admin-figure text-admin-muted">
                      {promotion.minimum_subtotal > 0
                        ? formatPrice(promotion.minimum_subtotal)
                        : "—"}
                    </Td>

                    <Td className="admin-figure text-[0.75rem] text-admin-faint">
                      {promotion.starts_at
                        ? formatDate(promotion.starts_at, {
                            day: "numeric",
                            month: "short",
                          })
                        : "Always"}
                      {promotion.ends_at
                        ? ` → ${formatDate(promotion.ends_at, {
                            day: "numeric",
                            month: "short",
                          })}`
                        : ""}
                    </Td>

                    <Td align="right" className="admin-figure text-admin-muted">
                      {promotion.usage_count}
                      {promotion.usage_limit !== null && (
                        <span className="text-admin-faint">
                          {" "}
                          / {promotion.usage_limit}
                        </span>
                      )}
                    </Td>

                    <Td align="right">
                      <Badge tone={live ? "positive" : "neutral"}>
                        {STATE_LABEL[promotion.state]}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination page={page} basePath="/admin/promotions" label="promotions" />
      </Panel>
    </>
  );
}

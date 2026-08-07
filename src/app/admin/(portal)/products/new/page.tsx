import { ArrowLeft } from "lucide-react";

import { requireAdmin } from "@/lib/admin/guard";
import { getCategories, getCountries } from "@/lib/catalog";
import { AdminButton, PageHeader } from "@/components/admin/primitives";
import { ProductCreateForm } from "@/components/admin/product-create-form";

export const metadata = { title: "New product" };

export default async function AdminNewProductPage() {
  await requireAdmin("products");

  // Fetched here rather than in the form: the catalogue reader is server-only,
  // and the selects need labels, not a second round trip from the browser.
  const [categories, countries] = await Promise.all([
    getCategories(),
    getCountries(),
  ]);

  return (
    <>
      <PageHeader
        title="New product"
      >
        <AdminButton variant="secondary" href="/admin/products">
          <ArrowLeft className="size-4" strokeWidth={2} />
          All products
        </AdminButton>
      </PageHeader>

      <ProductCreateForm
        categories={categories.map((category) => ({
          slug: category.slug,
          name: category.name,
        }))}
        countries={countries.map((country) => ({
          code: country.code,
          name: country.name,
        }))}
      />
    </>
  );
}

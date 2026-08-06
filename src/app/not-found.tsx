import Link from "next/link";

import { getCategories } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { Monogram } from "@/components/brand/logo";

export default async function NotFound() {
  const categories = (await getCategories()).slice(0, 6);

  return (
    <section className="container-shell flex min-h-[70svh] flex-col items-center justify-center py-24 text-center">
      <Monogram className="size-12 text-champagne-dark" />

      <p className="eyebrow-sm mt-10 text-muted-foreground">Error 404</p>
      <h1 className="mt-5 font-display text-4xl font-light leading-[1.06] lg:text-display-md">
        This page has left
        <br />
        <span className="italic">the workshop</span>
      </h1>
      <p className="mx-auto mt-6 max-w-md text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
        The address may have changed, or the piece may have been retired.
        Editions are small and are not repeated.
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <Button asChild size="lg">
          <Link href="/shop">Browse the collection</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/help/contact">Speak with an advisor</Link>
        </Button>
      </div>

      <nav aria-label="Collections" className="mt-16 border-t border-hairline pt-10">
        <p className="eyebrow-sm text-muted-foreground">Or start here</p>
        <ul className="mt-5 flex flex-wrap justify-center gap-x-8 gap-y-3">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/category/${category.slug}`}
                className="link-draw font-display text-lg font-light"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Monogram } from "@/components/brand/logo";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Replaced by the observability sink once the backend lands.
    console.error(error);
  }, [error]);

  return (
    <section className="container-shell flex min-h-[70svh] flex-col items-center justify-center py-24 text-center">
      <Monogram className="size-12 text-champagne-dark" />

      <p className="eyebrow-sm mt-10 text-muted-foreground">
        Something went wrong
      </p>
      <h1 className="mt-5 font-display text-4xl font-light leading-[1.06] lg:text-5xl">
        A stitch has dropped
      </h1>
      <p className="mx-auto mt-6 max-w-md text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
        This is our fault, not yours. Try again — and if it happens twice, a
        client advisor can complete anything you were in the middle of.
      </p>

      {error.digest && (
        <p className="mt-6 eyebrow-sm text-muted-foreground">
          Reference {error.digest}
        </p>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <Button size="lg" onClick={reset}>
          Try again
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/">Return home</Link>
        </Button>
      </div>
    </section>
  );
}

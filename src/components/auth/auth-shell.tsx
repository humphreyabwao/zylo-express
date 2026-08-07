import Image from "next/image";
import Link from "next/link";

import { Monogram } from "@/components/brand/logo";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  /** Pull-quote laid over the campaign image. */
  quote?: { text: string; attribution: string };
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function AuthShell({
  eyebrow,
  title,
  description,
  image,
  imageAlt,
  quote,
  footer,
  children,
}: AuthShellProps) {
  return (
    // `[&>*]:min-w-0` for the same reason as the product page: a grid item
    // floors at min-content, so anything inside the form that cannot shrink
    // sets the width of the panel and overflows the screen.
    <section className="grid min-h-[calc(100svh-4rem)] [&>*]:min-w-0 lg:grid-cols-2">
      {/* Campaign panel */}
      <div className="relative hidden overflow-hidden bg-obsidian lg:block">
        <Image
          src={image}
          alt={imageAlt}
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 scrim-full" aria-hidden />

        {quote && (
          <figure className="absolute inset-x-0 bottom-0 p-12 xl:p-16">
            <Monogram className="mb-8 size-9 text-champagne" />
            <blockquote className="max-w-md font-display text-2xl font-light italic leading-snug text-porcelain xl:text-3xl">
              “{quote.text}”
            </blockquote>
            <figcaption className="mt-5 eyebrow-sm text-porcelain/55">
              {quote.attribution}
            </figcaption>
          </figure>
        )}
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-5 py-16 sm:px-10 lg:px-16 xl:px-24">
        <div className="w-full max-w-md">
          <p className="eyebrow-sm text-champagne-dark">{eyebrow}</p>
          <h1 className="mt-5 font-display text-4xl font-light leading-[1.06]">
            {title}
          </h1>
          <p className="mt-4 text-sm font-light leading-relaxed text-muted-foreground">
            {description}
          </p>

          <div className="mt-10">{children}</div>

          {footer && (
            <div className="mt-10 border-t border-hairline pt-8 text-sm font-light text-muted-foreground">
              {footer}
            </div>
          )}

          <p className="mt-10 text-xs font-light leading-relaxed text-muted-foreground">
            Protected by reCAPTCHA. The{" "}
            <Link href="/legal/privacy" className="underline underline-offset-2">
              privacy policy
            </Link>{" "}
            and{" "}
            <Link href="/legal/terms" className="underline underline-offset-2">
              terms of sale
            </Link>{" "}
            apply.
          </p>
        </div>
      </div>
    </section>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";

interface EditorialSplitProps {
  eyebrow: string;
  title: string;
  body: string[];
  image: string;
  imageAlt: string;
  href: string;
  linkLabel: string;
  /** Places the image on the right instead of the left. */
  flip?: boolean;
  tone?: "default" | "inverse";
  stat?: { value: string; label: string }[];
}

export function EditorialSplit({
  eyebrow,
  title,
  body,
  image,
  imageAlt,
  href,
  linkLabel,
  flip = false,
  tone = "default",
  stat,
}: EditorialSplitProps) {
  const inverse = tone === "inverse";

  return (
    <section
      className={cn(
        "py-section",
        inverse && "bg-obsidian text-porcelain"
      )}
    >
      <div className="container-shell grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <Reveal
          variant="fade"
          className={cn("media-zoom relative", flip && "lg:order-2")}
        >
          <div className="relative aspect-4/5 w-full overflow-hidden bg-secondary lg:aspect-3/4">
            <Image
              src={image}
              alt={imageAlt}
              fill
              sizes="(min-width: 1024px) 46vw, 100vw"
              className="object-cover"
            />
          </div>
        </Reveal>

        <Reveal className={cn(flip && "lg:order-1")}>
          <p
            className={cn(
              "eyebrow-sm",
              inverse ? "text-champagne" : "text-champagne-dark"
            )}
          >
            {eyebrow}
          </p>

          <h2 className="mt-6 max-w-xl font-display text-4xl font-light leading-[1.06] lg:text-display-md">
            {title}
          </h2>

          <div
            className={cn(
              "mt-7 max-w-lg space-y-5 text-sm font-light leading-relaxed lg:text-base",
              inverse ? "text-porcelain/65" : "text-muted-foreground"
            )}
          >
            {body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>

          {stat && (
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-current/15 pt-8">
              {stat.map((entry) => (
                <div key={entry.label}>
                  <dt className="sr-only">{entry.label}</dt>
                  <dd>
                    <span className="block font-display text-3xl font-light">
                      {entry.value}
                    </span>
                    <span
                      className={cn(
                        "mt-1.5 block eyebrow-sm",
                        inverse ? "text-porcelain/45" : "text-muted-foreground"
                      )}
                    >
                      {entry.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <Link
            href={href}
            className="group/link mt-10 inline-flex items-center gap-3 eyebrow-sm transition-opacity duration-500 hover:opacity-60"
          >
            {linkLabel}
            <ArrowRight
              className="size-3.5 transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/link:translate-x-1.5"
              strokeWidth={1.25}
            />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

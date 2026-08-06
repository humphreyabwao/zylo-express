"use client";

import * as React from "react";
import Image from "next/image";

import type { ProductImage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: ProductImage[];
  productName: string;
  /** Index the variant selection wants shown; the gallery scrolls to it. */
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
}

/**
 * Desktop stacks every plate in a single column so the shopper scrolls through
 * the set — the pattern luxury houses use instead of a thumbnail carousel.
 * Below `lg` it becomes a snap-scrolling pager with a dot indicator.
 */
export function ProductGallery({
  images,
  productName,
  activeIndex = 0,
  onActiveIndexChange,
}: ProductGalleryProps) {
  const pagerRef = React.useRef<HTMLUListElement>(null);
  const stackRefs = React.useRef<(HTMLLIElement | null)[]>([]);
  const [visibleIndex, setVisibleIndex] = React.useState(activeIndex);

  // A colour selection wins over wherever the pager happens to be sitting.
  // Adjusting during render is the supported way to follow a prop without an
  // effect — React re-runs this component before touching the DOM.
  const [syncedIndex, setSyncedIndex] = React.useState(activeIndex);
  if (activeIndex !== syncedIndex) {
    setSyncedIndex(activeIndex);
    setVisibleIndex(activeIndex);
  }

  // Track the mobile pager position for the dots.
  React.useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;

    const onScroll = () => {
      const index = Math.round(pager.scrollLeft / pager.clientWidth);
      setVisibleIndex(index);
      onActiveIndexChange?.(index);
    };

    pager.addEventListener("scroll", onScroll, { passive: true });
    return () => pager.removeEventListener("scroll", onScroll);
  }, [onActiveIndexChange]);

  // Bring the pager to the selected plate.
  React.useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    if (Math.round(pager.scrollLeft / pager.clientWidth) === activeIndex) return;
    pager.scrollTo({ left: pager.clientWidth * activeIndex, behavior: "smooth" });
  }, [activeIndex]);

  const goTo = (index: number) => {
    const pager = pagerRef.current;
    pager?.scrollTo({ left: pager.clientWidth * index, behavior: "smooth" });
    stackRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    onActiveIndexChange?.(index);
  };

  return (
    <div>
      {/* Mobile / tablet pager */}
      <div className="lg:hidden">
        <ul
          ref={pagerRef}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        >
          {images.map((image, index) => (
            <li key={image.id} className="w-full shrink-0 snap-center">
              <div className="relative aspect-3/4 w-full bg-secondary">
                <Image
                  src={image.url}
                  alt={image.alt}
                  fill
                  priority={index === 0}
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-center justify-center gap-2.5">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`View image ${index + 1} of ${images.length}`}
              aria-current={visibleIndex === index}
              className={cn(
                "h-px w-8 transition-colors duration-500",
                visibleIndex === index ? "bg-foreground" : "bg-border-strong"
              )}
            />
          ))}
        </div>
      </div>

      {/* Desktop stack */}
      <ul className="hidden lg:block">
        {images.map((image, index) => (
          <li
            key={image.id}
            ref={(node) => {
              stackRefs.current[index] = node;
            }}
            className={cn("relative", index > 0 && "mt-3")}
          >
            <div className="media-zoom relative aspect-3/4 w-full overflow-hidden bg-secondary">
              <Image
                src={image.url}
                alt={
                  index === 0 ? `${productName} — ${image.alt}` : image.alt
                }
                fill
                priority={index === 0}
                sizes="(min-width: 1280px) 46vw, 50vw"
                className="object-cover"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

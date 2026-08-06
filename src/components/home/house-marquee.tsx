const PHRASES = [
  "Vegetable-tanned in Tuscany",
  "Saddle-stitched by hand",
  "Regulated in five positions",
  "18-carat, never plated",
  "Aged six months in glass",
  "Closed by hand, never fused",
  "Numbered and signed",
];

/**
 * A slow single-row marquee. The list is duplicated so the -50% translate
 * loops seamlessly; the copy is only announced once to assistive tech.
 */
export function HouseMarquee() {
  return (
    <section className="overflow-hidden border-y border-hairline bg-surface py-5">
      <div className="flex w-max animate-marquee items-center will-change-transform">
        {[0, 1].map((pass) => (
          <ul
            key={pass}
            className="flex items-center"
            aria-hidden={pass === 1 || undefined}
          >
            {PHRASES.map((phrase) => (
              <li
                key={phrase}
                className="flex items-center whitespace-nowrap eyebrow-sm text-muted-foreground"
              >
                <span className="px-8">{phrase}</span>
                <span className="size-1 rounded-full bg-champagne" aria-hidden />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}

import Link from "next/link";
import { CalendarCheck, Gift, RefreshCw, Truck } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";

const ASSURANCES = [
  {
    icon: Truck,
    title: "Insured delivery",
    body: "Complimentary and fully insured on every order, with signature on arrival.",
    href: "/help/shipping",
  },
  {
    icon: RefreshCw,
    title: "Thirty-day returns",
    body: "Unworn pieces may be returned within thirty days, collection arranged by us.",
    href: "/help/returns",
  },
  {
    icon: Gift,
    title: "Maison gifting",
    body: "Lacquered box, grosgrain ribbon and a hand-written card at no charge.",
    href: "/services#gifting",
  },
  {
    icon: CalendarCheck,
    title: "Private appointments",
    body: "An hour with a client advisor in any boutique, or by video from home.",
    href: "/services#appointments",
  },
];

export function Assurances() {
  return (
    <section className="border-t border-hairline">
      <ul className="container-shell grid gap-y-12 py-20 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-12">
        {ASSURANCES.map((item, index) => (
          <li key={item.title}>
            <Reveal delay={index * 70}>
              <Link href={item.href} className="group/assure block max-w-xs">
                <item.icon
                  className="size-5 text-champagne-dark"
                  strokeWidth={1}
                />
                <h3 className="mt-5 eyebrow-sm text-foreground">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm font-light leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
                <span className="mt-4 inline-block h-px w-8 origin-left bg-champagne-dark transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/assure:scale-x-[2.5]" />
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

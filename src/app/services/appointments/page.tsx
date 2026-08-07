import type { Metadata } from "next";

import { BOUTIQUES } from "@/data/content";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { AppointmentForm } from "@/components/content/appointment-form";

export const metadata: Metadata = {
  title: "Request an Appointment",
  description:
    "An hour in the boutique with a client advisor, or by video with the pieces brought to the camera one at a time. No charge.",
  alternates: { canonical: "/services/appointments" },
};

/**
 * The page every "book an appointment" button on the site now points at.
 *
 * Those buttons — /services#appointments, "Book in {city}" on each boutique
 * card, "Arrange a video appointment" on /boutiques — all linked to the
 * generic contact form, so a booking arrived as prose in the contact inbox
 * with no date and no boutique attached. This route is where the structured
 * request goes instead.
 *
 * `?boutique=Paris` and `?mode=video` preselect, so arriving from a specific
 * card does not mean re-choosing what the customer already chose.
 */
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const cities = BOUTIQUES.map((boutique) => boutique.city);

  const requested = read("boutique");
  // Validated against the real list rather than passed through: this lands in
  // a `<select value>`, and a value with no matching option silently selects
  // nothing.
  const defaultBoutique =
    requested && cities.includes(requested) ? requested : undefined;

  const defaultMode = read("mode") === "video" ? "video" : "in-person";

  return (
    <>
      <section className="container-shell pt-12 lg:pt-16">
        <Breadcrumbs
          crumbs={[
            { label: "Home", href: "/" },
            { label: "Services", href: "/services" },
            { label: "Appointments" },
          ]}
        />
        <p className="eyebrow-sm mt-8 text-champagne-dark">By invitation</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-light leading-[1.04] lg:text-display-md">
          Request an appointment
        </h1>
        <p className="mt-6 max-w-xl text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
          An hour with a client advisor and no one else in the room, or by video
          with the pieces brought to the lens one at a time. There is no charge,
          and nothing is held until an advisor confirms the time with you.
        </p>
      </section>

      <section className="container-shell pb-section pt-12">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
          <AppointmentForm
            boutiques={cities}
            defaultBoutique={defaultBoutique}
            defaultMode={defaultMode}
          />

          <aside className="space-y-8 lg:border-l lg:border-hairline lg:pl-12">
            <div>
              <p className="eyebrow-sm text-muted-foreground">What to expect</p>
              <ul className="mt-4 space-y-3 text-sm font-light leading-relaxed text-muted-foreground">
                <li>60 minutes, no charge.</li>
                <li>
                  Sizing, engraving proofs and made-to-order lead times settled
                  in the room rather than over three emails.
                </li>
                <li>
                  Video appointments in English, French and Japanese.
                </li>
              </ul>
            </div>

            <div>
              <p className="eyebrow-sm text-muted-foreground">Boutiques</p>
              <ul className="mt-4 space-y-4">
                {BOUTIQUES.map((boutique) => (
                  <li key={boutique.city} className="text-sm font-light">
                    <p className="text-foreground">{boutique.city}</p>
                    <p className="mt-0.5 leading-relaxed text-muted-foreground">
                      {boutique.street}
                    </p>
                    <p className="text-muted-foreground">{boutique.phone}</p>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

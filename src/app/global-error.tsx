"use client";

/**
 * Last-resort error boundary.
 *
 * `error.tsx` renders *inside* the root layout, so it cannot catch an error
 * thrown by the root layout itself. When that happens Next.js falls back to
 * this file — and when this file is absent, to its own built-in page, which is
 * unstyled bare HTML with no fonts, no navigation and no way back.
 *
 * That is why this exists: the previous failure mode was indistinguishable
 * from "the CSS did not load", which is a miserable thing to debug.
 *
 * It must render its own <html> and <body> because it replaces the root
 * layout entirely. Styling is inline for the same reason — if the root layout
 * failed, the stylesheet may be exactly what is missing, so this cannot depend
 * on Tailwind having loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          backgroundColor: "#fcfbf9",
          color: "#1b1b21",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.6875rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#8a7a52",
            }}
          >
            ZYLO Express
          </p>

          <h1
            style={{
              margin: "1.5rem 0 0",
              fontSize: "clamp(1.75rem, 5vw, 2.5rem)",
              fontWeight: 300,
              lineHeight: 1.1,
            }}
          >
            Something went badly wrong
          </h1>

          <p
            style={{
              margin: "1.25rem 0 0",
              fontSize: "0.9375rem",
              fontWeight: 300,
              lineHeight: 1.7,
              color: "#5c5c66",
            }}
          >
            The page could not be rendered at all. This is our fault, not
            yours — trying again often works, and the storefront is still
            running.
          </p>

          {error.digest && (
            // The digest is the only handle support has on a production error;
            // the message itself is withheld by Next.js on the server.
            <p
              style={{
                margin: "1.25rem 0 0",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.75rem",
                color: "#8a8a96",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <div
            style={{
              marginTop: "2.5rem",
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                cursor: "pointer",
                border: "1px solid #1b1b21",
                backgroundColor: "#1b1b21",
                color: "#fcfbf9",
                padding: "0.875rem 1.75rem",
                fontSize: "0.6875rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Try again
            </button>

            {/* A plain anchor, not next/link: the client router is part of
                what may have failed, so a full document load is the only
                reliable escape. The lint rule assumes a healthy app. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                border: "1px solid rgba(27,27,33,0.25)",
                color: "#1b1b21",
                padding: "0.875rem 1.75rem",
                fontSize: "0.6875rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                textDecoration: "none",
              }}
            >
              Back to shop
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}

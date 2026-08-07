/**
 * Find horizontal overflow at mobile widths.
 *
 * Guessing at responsiveness from source is unreliable — an element overflows
 * because of what it ends up *beside*, not because of how it is written. This
 * loads real pages at real viewport widths and reports the elements that
 * actually stick out past the viewport, with enough of a selector to find them.
 *
 * Uses the Edge that ships with Windows rather than downloading a browser.
 *
 *   node scripts/audit-responsive.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3001";

// 320 is the narrowest phone still in use; 390 is a modern iPhone.
const WIDTHS = [320, 390];

const PATHS = [
  "/",
  "/shop",
  "/account",
  "/account/orders",
  "/account/addresses",
  "/account/wishlist",
  "/account/settings",
  "/cart",
  "/checkout",
  "/sign-in",
  "/journal",
  "/services/appointments",
];

const browser = await chromium.launch({ channel: "msedge" });

// A product page slug has to come from the catalogue rather than be guessed.
const probe = await browser.newPage();
await probe.goto(`${BASE}/shop`, { waitUntil: "domcontentloaded" });
const productHref = await probe
  .locator('a[href^="/products/"]')
  .first()
  .getAttribute("href")
  .catch(() => null);
await probe.close();

if (productHref) PATHS.splice(2, 0, productHref);

const findings = [];

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  for (const path of PATHS) {
    const page = await context.newPage();

    try {
      const response = await page.goto(`${BASE}${path}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      const status = response?.status() ?? 0;
      if (status >= 400) {
        findings.push({ width, path, kind: "status", detail: String(status) });
        await page.close();
        continue;
      }

      const result = await page.evaluate((viewportWidth) => {
        const docWidth = document.documentElement.scrollWidth;
        const overflows = [];

        // An element whose ancestor clips it is not an overflow — a decorative
        // watermark deliberately hung off the edge of an `overflow-hidden`
        // panel has a bounding rect past the viewport and is invisible there.
        // getBoundingClientRect knows nothing about ancestor clipping, so
        // without this the report is mostly false positives.
        const isClipped = (el) => {
          for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
            const { overflowX, overflow } = getComputedStyle(n);
            if (/hidden|clip|auto|scroll/.test(overflowX + " " + overflow)) return true;
          }
          return false;
        };

        if (docWidth > viewportWidth + 1) {
          for (const el of document.querySelectorAll("body *")) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (isClipped(el)) continue;
            // Only the element itself sticking out, not a parent that is wide
            // because of it — the deepest offender is the one to fix.
            if (rect.right <= viewportWidth + 1 && rect.left >= -1) continue;
            if (el.querySelector("*") && [...el.children].some((child) => {
              const c = child.getBoundingClientRect();
              return c.right > viewportWidth + 1 || c.left < -1;
            })) continue;

            const id = el.id ? `#${el.id}` : "";
            const cls =
              typeof el.className === "string" && el.className
                ? "." + el.className.trim().split(/\s+/).slice(0, 4).join(".")
                : "";

            overflows.push({
              tag: el.tagName.toLowerCase() + id + cls,
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              text: (el.textContent ?? "").trim().slice(0, 40),
            });
          }
        }

        // Anything a finger cannot reliably hit. 24px is below every platform
        // guideline (Apple 44, Android 48) and is a deliberately low bar so
        // this reports only genuinely small targets.
        const small = [];
        for (const el of document.querySelectorAll(
          'a, button, [role="button"], input[type="checkbox"], input[type="radio"]'
        )) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.height >= 24 && rect.width >= 24) continue;
          // A desktop dropdown held at opacity-0 still has layout, and every
          // link in it reported as an undersized tap target. Nobody can tap
          // what nobody can see.
          if (
            !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          ) {
            continue;
          }
          // Visually-hidden skip links are 1x1 by design.
          if (rect.width <= 2 && rect.height <= 2) continue;
          small.push({
            tag: el.tagName.toLowerCase(),
            size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
            text: (el.textContent ?? "").trim().slice(0, 30) ||
              el.getAttribute("aria-label") ||
              "",
          });
        }

        return { docWidth, overflows, small };
      }, width);

      if (result.docWidth > width + 1) {
        findings.push({
          width,
          path,
          kind: "overflow",
          detail: `document ${result.docWidth}px wide`,
          elements: result.overflows.slice(0, 6),
        });
      }

      if (result.small.length) {
        findings.push({
          width,
          path,
          kind: "tap-target",
          detail: `${result.small.length} under 24px`,
          elements: result.small.slice(0, 6),
        });
      }
    } catch (error) {
      findings.push({
        width,
        path,
        kind: "error",
        detail: error.message.split("\n")[0].slice(0, 100),
      });
    }

    await page.close();
  }

  await context.close();
}

await browser.close();

/* ------------------------------------------------------------------ report */

if (!findings.length) {
  console.log("\nNo horizontal overflow or undersized tap targets found.\n");
  process.exit(0);
}

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);

for (const [kind, items] of Object.entries(byKind)) {
  console.log(`\n${"=".repeat(70)}\n${kind.toUpperCase()}\n${"=".repeat(70)}`);

  for (const item of items) {
    console.log(`\n  ${item.path}  @${item.width}px  — ${item.detail}`);
    for (const el of item.elements ?? []) {
      const where = el.size ? el.size : `${el.left}…${el.right}`;
      console.log(`      ${where}  ${el.tag ?? ""}`);
      if (el.text) console.log(`               "${el.text}"`);
    }
  }
}

console.log(`\n${findings.length} finding(s).\n`);

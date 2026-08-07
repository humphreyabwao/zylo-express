/**
 * Local production preview — what Vercel will actually serve.
 *
 * `next dev` is not a preview. It renders every page per request, skips the
 * static/dynamic split, and never runs the prerender that decides what gets
 * baked at build time. A page that fails only when prerendered — the class of
 * bug that makes a deployment look like an older build — passes in dev and
 * fails on Vercel. This runs the real build and serves it.
 *
 * Two deliberate separations, so this can run while `next dev` is up:
 *
 *   dist dir  `.next-preview`, not `.next`. `next build` deletes the previous
 *             hashed chunks as it writes new ones, so building into `.next`
 *             under a running dev server pulls that server's assets out from
 *             under it — every script and stylesheet 404s and the site renders
 *             as unstyled HTML. It looks like a CSS bug and is not one.
 *   port      3001, so dev keeps 3000.
 *
 * Usage:
 *   npm run preview           build, then serve on 3001
 *   npm run preview -- 4000   another port
 *   npm run preview -- --skip-build   re-serve the last preview build
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const DIST = ".next-preview";

const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const port = args.find((a) => /^\d+$/.test(a)) ?? "3001";

const env = { ...process.env, NEXT_DIST_DIR: DIST };

if (skipBuild) {
  if (!existsSync(DIST)) {
    process.stderr.write(
      `No previous build in ${DIST}. Run without --skip-build first.\n`
    );
    process.exit(1);
  }
  process.stdout.write(`Serving the existing build in ${DIST}.\n`);
} else {
  process.stdout.write(`\n── Building into ${DIST} ──\n`);

  const build = spawnSync("next build", { stdio: "inherit", shell: true, env });

  if (build.status !== 0) {
    process.stderr.write(
      "\nBuild failed — this is what a Vercel deployment would have hit.\n"
    );
    process.exit(build.status ?? 1);
  }
}

process.stdout.write(`\n── Serving on http://localhost:${port} ──\n`);
process.stdout.write(
  "Production mode: caching is on and pages are served as built.\n" +
    "Restart after a code change — nothing here hot-reloads.\n\n"
);

const server = spawn(`next start --port ${port}`, {
  stdio: "inherit",
  shell: true,
  env,
});

// Without this, Ctrl-C detaches the shell wrapper and leaves next start holding
// the port, so the next run fails with EADDRINUSE.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
    process.exit(0);
  });
}

server.on("exit", (code) => process.exit(code ?? 0));

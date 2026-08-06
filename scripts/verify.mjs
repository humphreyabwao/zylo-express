/**
 * Full verification pass: types, lint, production build.
 *
 * The build writes to `.next-verify` rather than `.next`. This matters more
 * than it looks. `next build` deletes the previous hashed chunks as it writes
 * new ones, so building into `.next` while a `next dev` or `next start` server
 * is running against it pulls that server's assets out from under it: the
 * server keeps serving prerendered HTML referencing the old hashes, every
 * stylesheet and script 404s, and the site renders as unstyled HTML. It looks
 * like a CSS bug and is not one.
 *
 * Written in Node rather than as a shell one-liner because `VAR=value cmd`
 * is sh syntax and npm scripts run through cmd.exe on Windows.
 */
import { spawnSync } from "node:child_process";

const steps = [
  ["Types", "tsc --noEmit"],
  ["Lint", "eslint"],
  ["Build", "next build"],
];

for (const [label, command] of steps) {
  process.stdout.write(`\n── ${label} ──\n`);

  // Passed as one string rather than (bin, args): with `shell: true` Node
  // concatenates an args array into the command line without escaping, which
  // it now warns about. These commands are constants, but the single-string
  // form is the documented one and avoids the warning.
  const result = spawnSync(command, {
    stdio: "inherit",
    // `shell` so npm's node_modules/.bin shims resolve on Windows too.
    shell: true,
    env: { ...process.env, NEXT_DIST_DIR: ".next-verify" },
  });

  if (result.status !== 0) {
    process.stderr.write(`\n${label} failed.\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write("\nAll checks passed. .next was not touched.\n");

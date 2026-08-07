/**
 * Removes truncated entries from the next/image disk cache.
 *
 * Next's image optimiser keeps one directory per cache key under
 * `<distDir>/cache/images` (and `<distDir>/dev/cache/images` for `next dev`),
 * each holding a single optimised file. On boot it replays every entry into an
 * in-memory LRU to enforce `maximumDiskCacheSize`, sizing each one by its byte
 * length — and that LRU throws on a size of 0:
 *
 *   LRUCache: calculateSize returned 0, but size must be > 0.
 *   Items with size 0 would never be evicted, causing unbounded cache growth.
 *
 * The throw happens inside the promise the optimiser stores without awaiting,
 * so it surfaces as an `unhandledRejection` with no useful stack. Worse, that
 * promise is a module-level singleton: once it rejects, it stays rejected for
 * the life of the process and every later image write fails with "Failed to
 * write image to cache". One bad byte count disables image caching entirely.
 *
 * A zero-byte entry is what an interrupted write leaves behind — Ctrl+C during
 * `next dev`, a crash mid-`writeFile`, or (this repo lives under OneDrive) a
 * sync client dehydrating a file it saw as idle. The file itself is worthless
 * either way; deleting the directory just forces a re-optimise on next request.
 *
 * Runs from `predev` and `prebuild`, and is a no-op when nothing is corrupt.
 */
import { readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";

// `next dev` and `next build` keep separate image caches; `npm run verify`
// builds into .next-verify, so sweep that too.
const distDirs = [".next", ".next-verify"];
const cacheDirs = distDirs.flatMap((dist) => [
  join(dist, "cache", "images"),
  join(dist, "dev", "cache", "images"),
]);

let removed = 0;

for (const cacheDir of cacheDirs) {
  const keys = await readdir(cacheDir).catch(() => []);

  for (const key of keys) {
    const entryDir = join(cacheDir, key);
    const files = await readdir(entryDir).catch(() => null);

    // Unreadable, or an empty directory left by a write that never got as far
    // as its file. Next skips these on its own, but they are still dead weight.
    if (files === null) continue;

    const sizes = await Promise.all(
      files.map((file) =>
        stat(join(entryDir, file))
          .then((s) => s.size)
          .catch(() => 0),
      ),
    );

    // Any zero-length file in the directory is enough to poison the LRU,
    // because Next sizes the whole entry from the first file it reads.
    if (files.length > 0 && sizes.every((size) => size > 0)) continue;

    await rm(entryDir, { recursive: true, force: true });
    removed += 1;
    process.stdout.write(`Pruned truncated image cache entry: ${entryDir}\n`);
  }
}

if (removed > 0) {
  process.stdout.write(
    `Pruned ${removed} truncated image cache ${removed === 1 ? "entry" : "entries"}.\n`,
  );
}

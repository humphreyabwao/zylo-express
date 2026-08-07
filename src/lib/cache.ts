import "server-only";

import { env, isRedisConfigured } from "@/lib/env";

/**
 * Two-tier cache: Upstash Redis when configured, an in-process LRU otherwise.
 *
 * The Redis client is written against the REST API with plain `fetch` rather
 * than pulling in `@upstash/redis` — it is a handful of calls, and it keeps the
 * dependency out of the serverless bundle.
 *
 * A cache is an optimisation, never a correctness requirement. Every operation
 * here fails soft: if Redis is down the request still serves, just slower.
 */

interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  /** Members of a tag's key-set, used to expand a tag into the keys it owns. */
  members(key: string): Promise<string[]>;
  addMembers(key: string, members: string[], ttlSeconds: number): Promise<void>;
  /**
   * Atomic increment returning the new value, setting the TTL on first write.
   * Backs rate limiting, where read-modify-write would let concurrent requests
   * both observe the same count and slip through.
   */
  increment(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number }>;
}

/* ----------------------------------------------------------- in-memory LRU */

class MemoryStore implements CacheStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();
  private readonly sets = new Map<string, { value: Set<string>; expiresAt: number }>();

  // Bounded so a long-lived server cannot grow this without limit. Map
  // preserves insertion order, so the first key is the oldest.
  constructor(private readonly maxEntries = 1000) {}

  private static alive(expiresAt: number): boolean {
    return expiresAt > Date.now();
  }

  async get(key: string): Promise<string | null> {
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (!MemoryStore.alive(hit.expiresAt)) {
      this.entries.delete(key);
      return null;
    }
    // Re-insert to mark as recently used.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.entries.delete(key);
      this.sets.delete(key);
    }
  }

  async members(key: string): Promise<string[]> {
    const hit = this.sets.get(key);
    if (!hit) return [];
    if (!MemoryStore.alive(hit.expiresAt)) {
      this.sets.delete(key);
      return [];
    }
    return [...hit.value];
  }

  async addMembers(key: string, members: string[], ttlSeconds: number): Promise<void> {
    const existing = this.sets.get(key);
    const expiresAt = Date.now() + ttlSeconds * 1000;

    if (existing && MemoryStore.alive(existing.expiresAt)) {
      for (const m of members) existing.value.add(m);
      existing.expiresAt = expiresAt;
      return;
    }
    this.sets.set(key, { value: new Set(members), expiresAt });
  }

  async increment(key: string, ttlSeconds: number) {
    const hit = this.counters.get(key);

    if (hit && MemoryStore.alive(hit.expiresAt)) {
      hit.count += 1;
      return {
        count: hit.count,
        ttl: Math.ceil((hit.expiresAt - Date.now()) / 1000),
      };
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.counters.set(key, { count: 1, expiresAt });
    return { count: 1, ttl: ttlSeconds };
  }

  private readonly counters = new Map<
    string,
    { count: number; expiresAt: number }
  >();
}

/* --------------------------------------------------------- Upstash (REST) */

type RedisCommand = (string | number)[];

class UpstashStore implements CacheStore {
  constructor(
    private readonly url: string,
    private readonly token: string
  ) {}

  /** Runs commands through the pipeline endpoint — one round trip for many. */
  private async pipeline(commands: RedisCommand[]): Promise<unknown[]> {
    if (!commands.length) return [];

    const response = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      // Next.js would otherwise try to cache this fetch, which would mean
      // caching the cache.
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Upstash ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as { result: unknown; error?: string }[];
    return payload.map((entry) => {
      if (entry.error) throw new Error(`Upstash: ${entry.error}`);
      return entry.result;
    });
  }

  async get(key: string): Promise<string | null> {
    const [result] = await this.pipeline([["GET", key]]);
    return typeof result === "string" ? result : null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.pipeline([["SET", key, value, "EX", ttlSeconds]]);
  }

  async del(keys: string[]): Promise<void> {
    if (!keys.length) return;
    await this.pipeline([["DEL", ...keys]]);
  }

  async members(key: string): Promise<string[]> {
    const [result] = await this.pipeline([["SMEMBERS", key]]);
    return Array.isArray(result) ? (result as string[]) : [];
  }

  async addMembers(key: string, members: string[], ttlSeconds: number): Promise<void> {
    if (!members.length) return;
    await this.pipeline([
      ["SADD", key, ...members],
      // Tag sets outlive their entries so invalidation still finds stale keys.
      ["EXPIRE", key, ttlSeconds * 2],
    ]);
  }

  async increment(key: string, ttlSeconds: number) {
    // INCR then a conditional EXPIRE: NX only sets the TTL when the key has
    // none, so a burst mid-window extends the count but not the window.
    const [count, , ttl] = await this.pipeline([
      ["INCR", key],
      ["EXPIRE", key, ttlSeconds, "NX"],
      ["TTL", key],
    ]);

    return {
      count: Number(count) || 0,
      ttl: Number(ttl) > 0 ? Number(ttl) : ttlSeconds,
    };
  }
}

/* -------------------------------------------------------------- singleton */

let store: CacheStore | null = null;

function getStore(): CacheStore {
  if (store) return store;

  if (isRedisConfigured()) {
    store = new UpstashStore(env.redisUrl!, env.redisToken!);
  } else {
    store = new MemoryStore();
  }
  return store;
}

/* ------------------------------------------------------------------ ttls */

/**
 * Named lifetimes, so cache duration is a decision recorded in one place
 * rather than a magic number sprinkled across call sites.
 */
export const TTL = {
  /** Catalogue content — changes only when an admin publishes. */
  catalog: 60 * 60,
  /** Facet counts — derived from the catalogue, same cadence. */
  facets: 60 * 30,
  /** Search results — cheap to recompute, high variance in keys. */
  search: 60 * 5,
  /** Inventory-sensitive reads. Short: overselling is worse than a cache miss. */
  inventory: 30,
  /** Editorial content. */
  content: 60 * 60 * 6,
  /**
   * Store settings — display currency, exchange rates, shipping threshold.
   *
   * Short on purpose. Writes invalidate the tag, so this ceiling only matters
   * when a rate is changed directly in the database or when the tag drop
   * fails; either way an hour of stale exchange rates is a shop quoting the
   * wrong price, which is a worse failure than a cache miss.
   */
  settings: 60,
} as const;

const PREFIX = "zylo:v1:";
const TAG_PREFIX = `${PREFIX}tag:`;

/* --------------------------------------------------------------- public */

export interface CacheOptions {
  ttl?: number;
  /** Invalidation groups. `invalidateTags(["products"])` drops every member. */
  tags?: string[];
}

/**
 * Memoises `fn` under `key`.
 *
 * On any cache error the underlying function still runs — a broken cache
 * degrades latency, never availability.
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl = TTL.catalog, tags = [] } = options;
  const fullKey = PREFIX + key;
  const cache = getStore();

  try {
    const hit = await cache.get(fullKey);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (error) {
    console.error("[cache] read failed, falling through:", error);
  }

  const value = await fn();

  try {
    await cache.set(fullKey, JSON.stringify(value), ttl);
    await Promise.all(
      tags.map((tag) => cache.addMembers(TAG_PREFIX + tag, [fullKey], ttl))
    );
  } catch (error) {
    console.error("[cache] write failed, value still returned:", error);
  }

  return value;
}

/** Drops every key registered under any of `tags`. */
export async function invalidateTags(tags: string[]): Promise<void> {
  if (!tags.length) return;
  const cache = getStore();

  try {
    const keySets = await Promise.all(
      tags.map((tag) => cache.members(TAG_PREFIX + tag))
    );
    const keys = [...new Set(keySets.flat())];

    await cache.del([...keys, ...tags.map((tag) => TAG_PREFIX + tag)]);
  } catch (error) {
    console.error("[cache] invalidation failed:", error);
  }
}

/** Cache tags, centralised so producers and invalidators cannot drift. */
export const CacheTags = {
  products: "products",
  product: (slug: string) => `product:${slug}`,
  categories: "categories",
  collections: "collections",
  countries: "countries",
  facets: "facets",
  articles: "articles",
  article: (slug: string) => `article:${slug}`,
  pages: "pages",
  page: (slug: string) => `page:${slug}`,
  settings: "settings",
} as const;

/** Builds a stable key from parts, skipping empties. */
export function cacheKey(...parts: (string | number | undefined | null)[]): string {
  return parts.filter((p) => p !== undefined && p !== null && p !== "").join(":");
}

/**
 * Atomic counter, exposed for the rate limiter.
 *
 * Deliberately not wrapped in the fail-soft handling the rest of this module
 * uses: the caller decides whether a counter failure means allow or deny.
 */
export function rawIncrement(
  key: string,
  ttlSeconds: number
): Promise<{ count: number; ttl: number }> {
  return getStore().increment(PREFIX + key, ttlSeconds);
}

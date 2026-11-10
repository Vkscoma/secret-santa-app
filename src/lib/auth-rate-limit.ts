import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

type RateLimitColumns = { counter: "attempts" | "count"; hasUpdatedAt: boolean };
let columnsPromise: Promise<RateLimitColumns> | undefined;

async function getRateLimitColumns(): Promise<RateLimitColumns> {
  columnsPromise ??= (async () => {
    const result = await db.execute(sql.raw(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'auth_rate_limits'"
    ));
    const columns = new Set(result.map((row) => String((row as { column_name: string }).column_name)));
    const counter = columns.has("attempts") ? "attempts" : columns.has("count") ? "count" : null;
    if (!columns.has("id") || !columns.has("key_hash") || !columns.has("window_started_at") || !counter) {
      throw new Error("The auth_rate_limits table has an unsupported schema.");
    }
    return { counter, hasUpdatedAt: columns.has("updated_at") };
  })();
  return columnsPromise;
}

function insertParts(columns: RateLimitColumns, keyHash: string, now: Date) {
  const counterColumn = sql.raw(`"${columns.counter}"`);
  const insertColumns = columns.hasUpdatedAt
    ? sql.raw(`"id", "key_hash", "window_started_at", "${columns.counter}", "updated_at"`)
    : sql.raw(`"id", "key_hash", "window_started_at", "${columns.counter}"`);
  const insertValues = columns.hasUpdatedAt
    ? sql`(${randomUUID()}, ${keyHash}, ${now.toISOString()}, 1, ${now.toISOString()})`
    : sql`(${randomUUID()}, ${keyHash}, ${now.toISOString()}, 1)`;
  return { counterColumn, insertColumns, insertValues };
}

export async function consumeOneTimeAuthRateLimit(keyHash: string, now = new Date()): Promise<boolean> {
  const columns = await getRateLimitColumns();
  const parts = insertParts(columns, keyHash, now);
  const result = await db.execute(sql`
    insert into public.auth_rate_limits (${parts.insertColumns}) values ${parts.insertValues}
    on conflict (key_hash) do nothing
    returning key_hash
  `);
  return result.length > 0;
}

export async function consumeAuthRateLimit(scope: string, now = new Date()) {
  const keyHash = createHash("sha256")
    .update(`${process.env.BETTER_AUTH_SECRET}:${scope}`)
    .digest("hex");
  const windowStart = new Date(now.getTime() - 60_000);
  const columns = await getRateLimitColumns();
  const parts = insertParts(columns, keyHash, now);
  const updatedAt = columns.hasUpdatedAt ? sql`, "updated_at" = ${now.toISOString()}` : sql.empty();
  const result = await db.execute(sql`
    insert into public.auth_rate_limits (${parts.insertColumns}) values ${parts.insertValues}
    on conflict (key_hash) do update set
      window_started_at = case
        when auth_rate_limits.window_started_at <= ${windowStart.toISOString()} then ${now.toISOString()}
        else auth_rate_limits.window_started_at
      end,
      ${parts.counterColumn} = case
        when auth_rate_limits.window_started_at <= ${windowStart.toISOString()} then 1
        else auth_rate_limits.${parts.counterColumn} + 1
      end${updatedAt}
    returning ${parts.counterColumn} as attempts
  `);
  const row = result[0] as { attempts?: number } | undefined;
  return (row?.attempts ?? 6) <= 5;
}

export function magicLinkRateScopes(email: string, ip: string) {
  return [`magic-email:${email}`, `magic-ip:${ip}`] as const;
}

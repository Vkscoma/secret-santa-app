import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/schema";
import { assertSyntheticSeedAllowed, upcomingSecretSantaYear } from "./seed-safety";

const demoUsers = [
  { id: "secret-santa-demo-ada", name: "Ada Evergreen", email: "ada@secret-santa-demo.invalid", displayName: "Ada" },
  { id: "secret-santa-demo-marco", name: "Marco Pine", email: "marco@secret-santa-demo.invalid", displayName: "Marco" },
  { id: "secret-santa-demo-jo", name: "Jo Snow", email: "jo@secret-santa-demo.invalid", displayName: "Jo" },
  { id: "secret-santa-demo-casey", name: "Casey Bright", email: "casey@secret-santa-demo.invalid", displayName: "Casey" },
  { id: "secret-santa-demo-riley", name: "Riley Frost", email: "riley@secret-santa-demo.invalid", displayName: "Riley" },
] as const;

const seedMarker = "Synthetic demo exchange created by scripts/seed.ts.";

async function main() {
  assertSyntheticSeedAllowed(process.env);
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is required to seed the development database.");

  const client = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    const result = await db.transaction(async (tx) => {
      const users: Array<{ id: string; name: string; email: string; displayName: string }> = [];
      for (const demo of demoUsers) {
        const [existing] = await tx.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, displayName: schema.user.displayName })
          .from(schema.user).where(eq(schema.user.email, demo.email)).limit(1);
        if (existing) {
          users.push({ ...existing, displayName: existing.displayName ?? demo.displayName });
          continue;
        }
        await tx.insert(schema.user).values({
          id: demo.id,
          name: demo.name,
          email: demo.email,
          displayName: demo.displayName,
          emailVerified: true,
          role: "user",
          notificationPrefs: { reminders: false, nudges: false, digests: false },
        }).onConflictDoNothing({ target: schema.user.id });
        const [created] = await tx.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, displayName: schema.user.displayName })
          .from(schema.user).where(eq(schema.user.email, demo.email)).limit(1);
        if (!created) throw new Error(`Could not create synthetic user ${demo.email}.`);
        users.push({ ...created, displayName: created.displayName ?? demo.displayName });
      }

      const now = new Date();
      const upcomingExchangeYear = upcomingSecretSantaYear(now);
      const definitions = [
        { year: upcomingExchangeYear - 1, name: `Secret Santa Demo ${upcomingExchangeYear - 1}`, status: "revealed" as const, exchangeAt: new Date(Date.UTC(upcomingExchangeYear - 1, 11, 25, 18)) },
        { year: upcomingExchangeYear, name: `Secret Santa Demo ${upcomingExchangeYear}`, status: "open" as const, exchangeAt: new Date(Date.UTC(upcomingExchangeYear, 11, 25, 18)) },
      ];
      const exchangeIds: string[] = [];
      for (const definition of definitions) {
        const [existing] = await tx.select({ id: schema.exchanges.id, status: schema.exchanges.status }).from(schema.exchanges)
          .where(and(eq(schema.exchanges.year, definition.year), eq(schema.exchanges.notes, seedMarker))).limit(1);
        if (existing) {
          if (definition.status === "revealed" && existing.status !== "revealed" && existing.status !== "closed") {
            await tx.update(schema.exchanges).set({ status: "revealed" }).where(eq(schema.exchanges.id, existing.id));
          }
          exchangeIds.push(existing.id);
          continue;
        }
        const [created] = await tx.insert(schema.exchanges).values({
          name: definition.name,
          year: definition.year,
          exchangeAt: definition.exchangeAt,
          timeZone: "America/Los_Angeles",
          budgetMin: 20,
          budgetMax: 50,
          notes: seedMarker,
          status: definition.status,
          createdBy: users[0]!.id,
        }).returning({ id: schema.exchanges.id });
        if (!created) throw new Error(`Could not create ${definition.name}.`);
        exchangeIds.push(created.id);
      }

      for (const [index, exchangeId] of exchangeIds.entries()) {
        const participants = users;
        const existingParticipants = await tx.select({ userId: schema.exchangeParticipants.userId })
          .from(schema.exchangeParticipants).where(eq(schema.exchangeParticipants.exchangeId, exchangeId));
        const existingIds = new Set(existingParticipants.map(({ userId }) => userId));
        const missing = participants.filter(({ id }) => !existingIds.has(id));
        if (missing.length) await tx.insert(schema.exchangeParticipants).values(missing.map(({ id }) => ({ exchangeId, userId: id })));

        const pastTime = definitions[index]!.exchangeAt;
        for (const person of participants) {
          const [wishlist] = await tx.select({ id: schema.wishlists.id }).from(schema.wishlists)
            .where(and(eq(schema.wishlists.exchangeId, exchangeId), eq(schema.wishlists.userId, person.id))).limit(1);
          let wishlistId = wishlist?.id;
          if (!wishlistId) {
            const [created] = await tx.insert(schema.wishlists).values({
              exchangeId,
              userId: person.id,
              surpriseMe: false,
              likes: index === 0 ? "Coffee, walks, cozy socks, and trying new recipes." : "Books, board games, and warm drinks.",
              updatedAt: index === 0 ? pastTime : new Date(pastTime.getTime() - 2 * 86_400_000),
            }).returning({ id: schema.wishlists.id });
            wishlistId = created?.id;
          }
          if (!wishlistId) throw new Error(`Could not open a wishlist for ${person.email}.`);
          const existingItems = await tx.select({ id: schema.wishlistItems.id }).from(schema.wishlistItems)
            .where(eq(schema.wishlistItems.wishlistId, wishlistId)).limit(1);
          if (existingItems.length) continue;
          const sampleItems = index === 0
            ? [
              { title: "Soft merino wool scarf", storeName: "North Pole Outfitters", notes: "Forest green or charcoal", priority: "most_wanted" },
              { title: "Small-batch hot chocolate", storeName: "Cocoa Cabin", notes: "Dark chocolate", priority: "would_like" },
            ]
            : [
              { title: "A favorite paperback", storeName: "Local Bookshop", notes: "Mystery or fantasy", priority: "most_wanted" },
            ];
          await tx.insert(schema.wishlistItems).values(sampleItems.map((item, sortOrder) => ({
            wishlistId: wishlistId!,
            ...item,
            url: null,
            imageUrl: null,
            priceMin: null,
            priceMax: null,
            priceBucket: null,
            sortOrder,
          })));
        }

        if (index === 0) {
          const existingAssignments = await tx.select({ giverId: schema.assignments.giverId })
            .from(schema.assignments).where(eq(schema.assignments.exchangeId, exchangeId));
          if (!existingAssignments.length) {
            await tx.insert(schema.assignments).values(participants.map((person, personIndex) => ({
              exchangeId,
              giverId: person.id,
              receiverId: participants[(personIndex + 1) % participants.length]!.id,
            })));
          }
        }
      }

      const [past] = await tx.select({ id: schema.exchanges.id, year: schema.exchanges.year }).from(schema.exchanges)
        .where(and(eq(schema.exchanges.year, definitions[0]!.year), eq(schema.exchanges.notes, seedMarker))).limit(1);
      const [current] = await tx.select({ id: schema.exchanges.id, year: schema.exchanges.year }).from(schema.exchanges)
        .where(and(eq(schema.exchanges.year, definitions[1]!.year), eq(schema.exchanges.notes, seedMarker))).limit(1);
      return { userCount: users.length, past, current };
    });
    console.info(`Synthetic Secret Santa data is ready: ${result.userCount} users, past exchange ${result.past?.year}, current exchange ${result.current?.year}.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Synthetic seed failed.");
  process.exitCode = 1;
});

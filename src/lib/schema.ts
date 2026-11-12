import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uuid,
  integer,
  jsonb,
  uniqueIndex,
  check,
  pgEnum,
} from "drizzle-orm/pg-core";

// Better Auth tables retain text IDs. Every application table uses UUID IDs.
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    role: text("role").default("user").notNull(),
    displayName: text("display_name"),
    shippingAddress: text("shipping_address"),
    sizes: text("sizes"),
    notes: text("notes"),
    notificationPrefs: jsonb("notification_prefs")
      .$type<Record<string, boolean>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("user_email_idx").on(table.email)]
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_token_idx").on(table.token),
  ]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    index("account_provider_account_idx").on(table.providerId, table.accountId),
  ]
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const exchangeStatus = pgEnum("exchange_status", ["open", "drawn", "revealed", "closed"]);

export const exchanges = pgTable(
  "exchange",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    year: integer("year").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "restrict" }),
    budgetMin: integer("budget_min"),
    budgetMax: integer("budget_max"),
    exchangeAt: timestamp("exchange_at", { withTimezone: true }).notNull(),
    timeZone: text("time_zone").default("America/Los_Angeles").notNull(),
    notes: text("notes"),
    status: exchangeStatus("status").default("open").notNull(),
    autoReveal: boolean("auto_reveal").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("exchange_year_idx").on(table.year),
    check("exchange_budget_range_check", sql`${table.budgetMin} is null or ${table.budgetMax} is null or ${table.budgetMin} <= ${table.budgetMax}`),
  ]
);

export const allowlist = pgTable(
  "allowlist",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    exchangeId: uuid("exchange_id").references(() => exchanges.id, { onDelete: "cascade" }),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    source: text("source").default("admin").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("allowlist_global_email_unique").on(table.email).where(sql`${table.exchangeId} is null`),
    uniqueIndex("allowlist_email_exchange_unique").on(table.email, table.exchangeId).where(sql`${table.exchangeId} is not null`),
    index("allowlist_exchange_idx").on(table.exchangeId),
  ]
);

export const inviteLinks = pgTable(
  "invite_links",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tokenHash: text("token_hash").notNull().unique(),
    exchangeId: uuid("exchange_id").notNull().references(() => exchanges.id, { onDelete: "cascade" }),
    exchangeNameSnapshot: text("exchange_name_snapshot").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at"),
    maxUses: integer("max_uses"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("invite_links_exchange_idx").on(table.exchangeId)]
);

export const exchangeParticipants = pgTable(
  "exchange_participant",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    exchangeId: uuid("exchange_id").notNull().references(() => exchanges.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("exchange_participant_exchange_user_unique").on(table.exchangeId, table.userId),
    index("exchange_participant_user_idx").on(table.userId),
  ]
);

export const exclusions = pgTable(
  "exclusion",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    exchangeId: uuid("exchange_id").notNull().references(() => exchanges.id, { onDelete: "cascade" }),
    giverId: text("giver_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    receiverId: text("receiver_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("exclusion_exchange_giver_receiver_unique").on(table.exchangeId, table.giverId, table.receiverId),
    index("exclusion_exchange_idx").on(table.exchangeId),
    check("exclusion_no_self_check", sql`${table.giverId} <> ${table.receiverId}`),
  ]
);

export const assignments = pgTable(
  "assignment",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    exchangeId: uuid("exchange_id").notNull().references(() => exchanges.id, { onDelete: "cascade" }),
    giverId: text("giver_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    receiverId: text("receiver_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("assignment_exchange_giver_unique").on(table.exchangeId, table.giverId),
    uniqueIndex("assignment_exchange_receiver_unique").on(table.exchangeId, table.receiverId),
    index("assignment_exchange_idx").on(table.exchangeId),
    check("assignment_no_self_check", sql`${table.giverId} <> ${table.receiverId}`),
  ]
);

export const messages = pgTable("message", {
  id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
  senderRole: text("sender_role").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
}, (table) => [
  index("message_assignment_sent_idx").on(table.assignmentId, table.sentAt),
  check("message_sender_role_check", sql`${table.senderRole} in ('giver', 'recipient')`),
  check("message_body_length_check", sql`char_length(${table.body}) between 1 and 1000`),
]);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_created_at_idx").on(table.createdAt),
    index("audit_log_target_idx").on(table.targetType, table.targetId),
  ]
);

export const inviteRedemptions = pgTable(
  "invite_redemptions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    inviteLinkId: uuid("invite_link_id")
      .notNull()
      .references(() => inviteLinks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("invite_redemptions_invite_user_unique").on(
      table.inviteLinkId,
      table.userId
    ),
    index("invite_redemptions_user_idx").on(table.userId),
  ]
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    keyHash: text("key_hash").notNull().unique(),
    windowStartedAt: timestamp("window_started_at").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipientUserId: text("recipient_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    exchangeId: uuid("exchange_id").references(() => exchanges.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull().default("pending"),
    sentAt: timestamp("sent_at"),
    errorAt: timestamp("error_at"),
    error: text("error"),
    providerId: text("provider_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("email_log_recipient_created_idx").on(table.recipientUserId, table.createdAt),
    index("email_log_exchange_type_idx").on(table.exchangeId, table.type),
    check("email_log_status_check", sql`${table.status} in ('pending', 'sent', 'failed')`),
  ]
);

export const wishlists = pgTable(
  "wishlist",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    exchangeId: uuid("exchange_id").notNull().references(() => exchanges.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    surpriseMe: boolean("surprise_me").default(false).notNull(),
    likes: text("likes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    uniqueIndex("wishlist_exchange_user_unique").on(table.exchangeId, table.userId),
    index("wishlist_user_idx").on(table.userId),
  ]
);

export const wishlistItems = pgTable(
  "wishlist_item",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    wishlistId: uuid("wishlist_id").notNull().references(() => wishlists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url"),
    imageUrl: text("image_url"),
    storeName: text("store_name"),
    previewFinalUrl: text("preview_final_url"),
    priceFetchedAt: timestamp("price_fetched_at"),
    previewTitlePending: boolean("preview_title_pending").default(false).notNull(),
    previewPrice: text("preview_price"),
    previewCurrency: text("preview_currency"),
    notes: text("notes"),
    priority: text("priority").default("would_like").notNull(),
    priceMin: integer("price_min"),
    priceMax: integer("price_max"),
    priceBucket: text("price_bucket"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("wishlist_item_wishlist_order_idx").on(table.wishlistId, table.sortOrder),
    check("wishlist_item_price_range_check", sql`${table.priceMin} is null or ${table.priceMin} >= 0`),
    check("wishlist_item_price_max_check", sql`${table.priceMax} is null or ${table.priceMax} >= 0`),
    check("wishlist_item_price_order_check", sql`${table.priceMin} is null or ${table.priceMax} is null or ${table.priceMin} <= ${table.priceMax}`),
    check("wishlist_item_priority_check", sql`${table.priority} in ('most_wanted', 'would_like', 'nice_to_have')`),
  ]
);

export const itemClaims = pgTable(
  "item_claim",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    itemId: uuid("item_id").notNull().references(() => wishlistItems.id, { onDelete: "cascade" }),
    giverId: text("giver_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("item_claim_item_giver_unique").on(table.itemId, table.giverId),
    index("item_claim_giver_idx").on(table.giverId),
  ]
);

export const unfurlCache = pgTable(
  "unfurl_cache",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    normalizedUrl: text("normalized_url").notNull().unique(),
    title: text("title"),
    imageUrl: text("image_url"),
    siteName: text("site_name"),
    price: text("price"),
    currency: text("currency"),
    description: text("description"),
    variant: text("variant"),
    availability: text("availability"),
    diagnostics: jsonb("diagnostics").$type<Record<string, unknown>>(),
    metadataVersion: integer("metadata_version").default(0).notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  }
);

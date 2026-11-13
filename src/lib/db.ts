import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDatabase() {
  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("POSTGRES_URL environment variable is not set");
  }

  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

type Database = ReturnType<typeof createDatabase>;
let database: Database | undefined;

// Route modules (including auth adapters) can be loaded during a build. Defer
// URL parsing and client creation until a request actually accesses the database.
// Bind methods to the real Drizzle instance so transactions and builders retain
// their original `this` context even when a caller extracts a method.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = (database ??= createDatabase());
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

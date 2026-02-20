import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Database = ReturnType<typeof getDb>;

export function getDb(d1: D1Database) {
  return drizzle(d1, {
    schema,
    logger: process.env.NODE_ENV === "development",
  });
}

export { schema };

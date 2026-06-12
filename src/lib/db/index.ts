import "server-only"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

const DB_PATH = process.env.DATABASE_URL ?? "./data/nage.db"

mkdirSync(dirname(DB_PATH), { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")

export const db = drizzle(sqlite, { schema })
export { schema }
export type DB = typeof db

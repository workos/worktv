#!/usr/bin/env tsx
/**
 * Database Migration Runner for Cloudflare D1
 *
 * Runs pending migrations against the D1 database.
 * Migrations are SQL files in the migrations/ directory, named with timestamps.
 *
 * Usage:
 *   tsx scripts/migrate.ts
 *   npm run migrate
 *
 * Environment variables required:
 *   - CLOUDFLARE_API_TOKEN: Cloudflare API token with D1 permissions
 *   - CLOUDFLARE_ACCOUNT_ID: Your Cloudflare account ID
 *
 * The D1 database ID is read from wrangler.toml.
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

function getD1DatabaseId(): string {
  const wranglerPath = join(process.cwd(), "wrangler.toml");
  const content = readFileSync(wranglerPath, "utf-8");
  const match = content.match(/database_id\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not find database_id in wrangler.toml");
  }
  return match[1];
}

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.error("❌ Missing required environment variables:");
  if (!CLOUDFLARE_API_TOKEN) console.error("   - CLOUDFLARE_API_TOKEN");
  if (!CLOUDFLARE_ACCOUNT_ID) console.error("   - CLOUDFLARE_ACCOUNT_ID");
  process.exit(1);
}

const D1_DATABASE_ID = getD1DatabaseId();

const D1_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`;

interface D1Result<T = unknown> {
  success: boolean;
  result?: T[];
  errors?: { message: string }[];
}

interface MigrationRecord {
  name: string;
}

async function executeD1Query<T = unknown>(sql: string): Promise<D1Result<T>> {
  const response = await fetch(`${D1_API_BASE}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`D1 API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await executeD1Query<MigrationRecord>("SELECT name FROM _migrations ORDER BY id");

  if (!result.success) {
    throw new Error(`Failed to get applied migrations: ${result.errors?.[0]?.message}`);
  }

  const migrations = new Set<string>();
  if (result.result && Array.isArray(result.result)) {
    for (const row of result.result) {
      migrations.add(row.name);
    }
  }

  return migrations;
}

async function recordMigration(name: string): Promise<void> {
  const now = new Date().toISOString();
  const sql = `INSERT INTO _migrations (name, applied_at) VALUES ('${name}', '${now}')`;
  const result = await executeD1Query(sql);

  if (!result.success) {
    throw new Error(`Failed to record migration ${name}: ${result.errors?.[0]?.message}`);
  }
}

function getMigrationFiles(): string[] {
  const migrationsDir = join(process.cwd(), "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // Lexicographic sort (relies on timestamp prefix)

  return files;
}

async function applyMigration(filename: string): Promise<void> {
  const migrationsDir = join(process.cwd(), "migrations");
  const filepath = join(migrationsDir, filename);
  const sql = readFileSync(filepath, "utf-8");

  console.log(`   Applying ${filename}...`);

  // Split SQL into individual statements (D1 API requires one statement at a time)
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    const result = await executeD1Query(statement);
    if (!result.success) {
      throw new Error(`Failed to execute statement: ${result.errors?.[0]?.message}\nSQL: ${statement}`);
    }
  }

  await recordMigration(filename);
  console.log(`   ✓ Applied ${filename}`);
}

async function main() {
  console.log("🔄 Running database migrations...\n");

  // Ensure _migrations table exists
  console.log("📦 Initializing migration tracking...");
  await executeD1Query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  // Get list of applied migrations
  const appliedMigrations = await getAppliedMigrations();
  console.log(`   Found ${appliedMigrations.size} applied migration(s)\n`);

  // Get list of migration files
  const migrationFiles = getMigrationFiles();
  console.log(`📂 Found ${migrationFiles.length} migration file(s)\n`);

  if (migrationFiles.length === 0) {
    console.log("✅ No migrations to run");
    return;
  }

  // Apply pending migrations
  const pendingMigrations = migrationFiles.filter(
    (f) => !appliedMigrations.has(f)
  );

  if (pendingMigrations.length === 0) {
    console.log("✅ All migrations already applied");
    return;
  }

  console.log(`🚀 Applying ${pendingMigrations.length} pending migration(s):\n`);

  for (const migration of pendingMigrations) {
    try {
      await applyMigration(migration);
    } catch (error) {
      console.error(`\n❌ Migration failed: ${migration}`);
      console.error(`   Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ Successfully applied ${pendingMigrations.length} migration(s)`);
}

main().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});

# Database Migrations

This directory contains database migrations for the Cloudflare D1 database.

## How Migrations Work

Migrations are SQL files that are applied in order to the D1 database. They are tracked in the `_migrations` table to ensure each migration runs only once.

## Naming Convention

Migration files must follow this naming pattern:

```
YYYYMMDD_description.sql
```

Examples:
- `20260206_initial_schema.sql`
- `20260207_add_custom_title_column.sql`
- `20260208_add_performance_indexes.sql`

The timestamp prefix ensures migrations are applied in the correct order (lexicographic sort).

## Creating a Migration

1. Create a new file in this directory with the current date:
   ```bash
   touch migrations/$(date +%Y%m%d)_your_migration_name.sql
   ```

2. Write idempotent SQL (safe to run multiple times):
   ```sql
   -- Good: Uses IF NOT EXISTS
   CREATE TABLE IF NOT EXISTS new_table (
     id TEXT PRIMARY KEY
   );

   -- Good: Checks before adding column (SQLite doesn't support IF NOT EXISTS for ALTER)
   -- Add column manually only if it doesn't exist
   ALTER TABLE recordings ADD COLUMN new_field TEXT;

   -- Bad: Will fail if table already exists
   CREATE TABLE new_table (id TEXT PRIMARY KEY);
   ```

3. Test locally:
   ```bash
   export CLOUDFLARE_API_TOKEN="..."
   export CLOUDFLARE_ACCOUNT_ID="..."
   export D1_DATABASE_ID="..."
   npm run migrate
   ```

4. Commit and push:
   ```bash
   git add migrations/20260207_your_migration.sql
   git commit -m "Add migration: your description"
   git push origin main
   ```

GitHub Actions will automatically apply the migration during deployment.

## Migration Guidelines

### DO ✅

- Use `CREATE TABLE IF NOT EXISTS`
- Use `CREATE INDEX IF NOT EXISTS`
- Keep migrations small and focused
- Test migrations locally first
- Add comments explaining what the migration does
- Make migrations idempotent when possible

### DON'T ❌

- Don't delete old migration files
- Don't modify existing migrations (create new ones instead)
- Don't include data that will change frequently
- Don't use transactions (not supported by D1 API)
- Don't forget to test before pushing

## Migration Tracking

Applied migrations are recorded in the `_migrations` table:

```sql
CREATE TABLE _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
```

View applied migrations:
```bash
npx wrangler d1 execute workos-tv \
  --command "SELECT * FROM _migrations ORDER BY applied_at DESC"
```

## Rollback

Migrations are forward-only. To rollback a change:

1. Create a new migration that reverses the change
2. Push to main

Example:
```sql
-- migrations/20260208_revert_new_field.sql
ALTER TABLE recordings DROP COLUMN new_field;
```

## Examples

### Adding a Column

```sql
-- migrations/20260207_add_tags_column.sql
-- Add tags field to recordings for categorization

ALTER TABLE recordings ADD COLUMN tags TEXT;
```

### Adding an Index

```sql
-- migrations/20260207_add_search_indexes.sql
-- Add indexes to improve search performance

CREATE INDEX IF NOT EXISTS idx_recordings_title ON recordings(title);
CREATE INDEX IF NOT EXISTS idx_segments_text ON segments(text);
```

### Creating a Table

```sql
-- migrations/20260207_add_notifications_table.sql
-- Add notifications table for user alerts

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
```

### Data Migration

```sql
-- migrations/20260207_backfill_custom_titles.sql
-- Copy title to custom_title for existing recordings

UPDATE recordings
SET custom_title = title
WHERE custom_title IS NULL;
```

## Common SQLite Limitations

D1 uses SQLite, which has some limitations:

- No `ALTER COLUMN` (must create new table, copy data, drop old)
- No `DROP COLUMN` in older SQLite versions
- No `IF NOT EXISTS` for `ALTER TABLE ADD COLUMN`
- Transactions not supported via D1 API (each statement auto-commits)

## Troubleshooting

**Migration fails with "table already exists"**
- Check if migration was partially applied
- Use `IF NOT EXISTS` clauses
- Check `_migrations` table to see what was recorded

**Migration runs locally but fails in CI**
- Check GitHub secrets are configured correctly
- Verify API token has D1 permissions
- Check D1 database ID matches

**Need to skip a migration**
- Not recommended! Migrations should always be applied
- If absolutely necessary, manually insert into `_migrations` table

**Need to re-run a migration**
- Delete the entry from `_migrations` table
- Re-run migrations
- Or create a new migration that applies the same changes

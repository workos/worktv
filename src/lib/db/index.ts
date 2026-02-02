import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Recording, TranscriptSegment, Speaker, Clip } from "@/types/video";

const DB_PATH = join(process.cwd(), "data", "recordings.db");

let db: Database.Database | null = null;

function runMigrations(database: Database.Database): void {
  // Get existing columns in recordings table
  const columns = database
    .prepare("PRAGMA table_info(recordings)")
    .all() as { name: string }[];
  const columnNames = new Set(columns.map((c) => c.name));

  // Add poster_url column if it doesn't exist
  if (!columnNames.has("poster_url")) {
    database.exec("ALTER TABLE recordings ADD COLUMN poster_url TEXT");
  }

  // Add preview_gif_url column if it doesn't exist
  if (!columnNames.has("preview_gif_url")) {
    database.exec("ALTER TABLE recordings ADD COLUMN preview_gif_url TEXT");
  }
}

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = join(process.cwd(), "data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Initialize schema
    const schemaPath = join(process.cwd(), "src", "lib", "db", "schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");

    // Separate main schema from migration comments
    const migrationRegex =
      /-- MIGRATION:ADD_COLUMN:(\w+):(\w+):(.+)/g;
    const migrations: { table: string; column: string; definition: string }[] =
      [];
    let match;
    while ((match = migrationRegex.exec(schema)) !== null) {
      migrations.push({
        table: match[1],
        column: match[2],
        definition: match[3],
      });
    }

    // Run main schema (CREATE TABLE IF NOT EXISTS statements are safe)
    db.exec(schema);

    // Run migrations with error handling (column may already exist)
    for (const migration of migrations) {
      try {
        db.exec(
          `ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition}`
        );
      } catch {
        // Column already exists, ignore
      }
    }

    // Run additional migrations for preview GIFs
    runMigrations(db);
  }
  return db;
}

export interface RecordingRow {
  id: string;
  title: string;
  custom_title: string | null;
  description: string | null;
  video_url: string;
  duration: number;
  space: string;
  source: string;
  media_type: string | null;
  media_url_expires_at: string | null;
  created_at: string;
  synced_at: string;
  poster_url: string | null;
  preview_gif_url: string | null;
}

export interface SegmentRow {
  id: string;
  recording_id: string;
  start_time: number;
  end_time: number;
  speaker: string;
  text: string;
}

export interface SpeakerRow {
  id: string;
  recording_id: string;
  name: string;
  color: string;
}

export interface VideoFileRow {
  id: string;
  recording_id: string;
  view_type: string;
  video_url: string;
}

export interface ChatMessageRow {
  id: string;
  recording_id: string;
  timestamp: number;
  sender: string;
  message: string;
}

export interface SummaryRow {
  id: string;
  recording_id: string;
  content: string;
  model: string;
  generated_at: string;
}

export interface ClipRow {
  id: string;
  recording_id: string;
  title: string | null;
  start_time: number;
  end_time: number;
  created_at: string;
}

// Query functions
export function getAllRecordings(): RecordingRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM recordings WHERE duration >= 60 ORDER BY created_at DESC`)
    .all() as RecordingRow[];
}

export function getRecordingsBySource(
  source: "zoom" | "gong" | "all"
): RecordingRow[] {
  const db = getDb();
  if (source === "all") {
    return getAllRecordings();
  }
  return db
    .prepare(
      `SELECT * FROM recordings WHERE duration >= 60 AND source = ? ORDER BY created_at DESC`
    )
    .all(source) as RecordingRow[];
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function getRecordingsPaginated(
  source: "zoom" | "gong" | "all",
  limit: number = 20,
  cursor?: string
): PaginatedResult<RecordingRow> {
  const db = getDb();
  const sourceFilter = source !== "all" ? "AND source = ?" : "";

  // Parse compound cursor (created_at|id) for stable pagination
  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    const parts = cursor.split("|");
    cursorCreatedAt = parts[0];
    cursorId = parts[1] || null;
  }

  // Use compound cursor to avoid skipping/duplicating records with same timestamp
  const cursorFilter = cursorCreatedAt
    ? cursorId
      ? "AND (created_at < ? OR (created_at = ? AND id < ?))"
      : "AND created_at < ?"
    : "";

  const params: (string | number)[] = [];
  if (source !== "all") params.push(source);
  if (cursorCreatedAt) {
    params.push(cursorCreatedAt);
    if (cursorId) {
      params.push(cursorCreatedAt);
      params.push(cursorId);
    }
  }
  params.push(limit + 1);

  const rows = db
    .prepare(
      `SELECT * FROM recordings
       WHERE duration >= 60 ${sourceFilter} ${cursorFilter}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(...params) as RecordingRow[];

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? `${lastItem.created_at}|${lastItem.id}` : null;

  return { items, hasMore, nextCursor };
}

export function isMediaUrlExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function updateMediaUrl(
  id: string,
  videoUrl: string,
  expiresAt: string
): void {
  const db = getDb();
  db.prepare(
    `UPDATE recordings SET video_url = ?, media_url_expires_at = ?, synced_at = ? WHERE id = ?`
  ).run(videoUrl, expiresAt, new Date().toISOString(), id);
}

export function updateRecordingCustomTitle(
  id: string,
  customTitle: string | null
): void {
  const db = getDb();
  db.prepare(`UPDATE recordings SET custom_title = ? WHERE id = ?`).run(
    customTitle,
    id
  );
}

// Escape SQL LIKE wildcards in user input
function escapeLikeWildcards(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

export function searchRecordings(
  query: string,
  source?: "zoom" | "gong" | "all"
): RecordingRow[] {
  const db = getDb();
  const searchTerm = `%${escapeLikeWildcards(query)}%`;

  // Search in titles (including custom titles) and transcript text
  if (source && source !== "all") {
    return db
      .prepare(
        `SELECT DISTINCT r.* FROM recordings r
         LEFT JOIN segments s ON r.id = s.recording_id
         WHERE r.duration >= 60 AND r.source = ? AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
         ORDER BY r.created_at DESC`
      )
      .all(source, searchTerm, searchTerm, searchTerm, searchTerm) as RecordingRow[];
  }

  return db
    .prepare(
      `SELECT DISTINCT r.* FROM recordings r
       LEFT JOIN segments s ON r.id = s.recording_id
       WHERE r.duration >= 60 AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
       ORDER BY r.created_at DESC`
    )
    .all(searchTerm, searchTerm, searchTerm, searchTerm) as RecordingRow[];
}

export interface SearchResultRow extends RecordingRow {
  match_type: "title" | "custom_title" | "transcript" | "speaker";
  match_text: string | null;
  match_time: number | null;
}

export function searchRecordingsWithContext(
  query: string,
  source?: "zoom" | "gong" | "all"
): SearchResultRow[] {
  const db = getDb();
  const searchTerm = `%${escapeLikeWildcards(query)}%`;
  const sourceFilter = source && source !== "all" ? `AND r.source = '${source}'` : "";

  // Query that determines match type and includes context
  const sql = `
    SELECT DISTINCT r.*,
      CASE
        WHEN r.custom_title LIKE ? ESCAPE '\\' THEN 'custom_title'
        WHEN r.title LIKE ? ESCAPE '\\' THEN 'title'
        WHEN EXISTS (SELECT 1 FROM segments WHERE recording_id = r.id AND speaker LIKE ? ESCAPE '\\') THEN 'speaker'
        ELSE 'transcript'
      END as match_type,
      CASE
        WHEN r.custom_title LIKE ? ESCAPE '\\' THEN r.custom_title
        WHEN r.title LIKE ? ESCAPE '\\' THEN r.title
        WHEN EXISTS (SELECT 1 FROM segments WHERE recording_id = r.id AND speaker LIKE ? ESCAPE '\\')
          THEN (SELECT speaker FROM segments WHERE recording_id = r.id AND speaker LIKE ? ESCAPE '\\' LIMIT 1)
        ELSE (SELECT text FROM segments WHERE recording_id = r.id AND text LIKE ? ESCAPE '\\' LIMIT 1)
      END as match_text,
      CASE
        WHEN r.custom_title LIKE ? ESCAPE '\\' OR r.title LIKE ? ESCAPE '\\' THEN NULL
        ELSE (SELECT start_time FROM segments WHERE recording_id = r.id AND (text LIKE ? ESCAPE '\\' OR speaker LIKE ? ESCAPE '\\') LIMIT 1)
      END as match_time
    FROM recordings r
    LEFT JOIN segments s ON r.id = s.recording_id
    WHERE r.duration >= 60 ${sourceFilter}
      AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
    ORDER BY r.created_at DESC
  `;

  return db
    .prepare(sql)
    .all(
      searchTerm, searchTerm, searchTerm, // match_type CASE
      searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, // match_text CASE
      searchTerm, searchTerm, searchTerm, searchTerm, // match_time CASE
      searchTerm, searchTerm, searchTerm, searchTerm // WHERE clause
    ) as SearchResultRow[];
}

export function getRecordingById(id: string): RecordingRow | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM recordings WHERE id = ?`)
    .get(id) as RecordingRow | undefined;
}

// Generic/default meeting titles that shouldn't be grouped as related
const GENERIC_TITLES = [
  "Google Calendar Meeting (not synced)",
  "Zoom Meeting",
  "Personal Meeting Room",
];

export function getRelatedRecordings(title: string, excludeId: string): RecordingRow[] {
  // Don't group meetings with generic/default titles
  if (GENERIC_TITLES.includes(title)) {
    return [];
  }

  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM recordings
       WHERE title = ? AND id != ? AND duration >= 60
       ORDER BY created_at DESC`
    )
    .all(title, excludeId) as RecordingRow[];
}

export function getSegmentsByRecordingId(recordingId: string): SegmentRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM segments WHERE recording_id = ? ORDER BY start_time`
    )
    .all(recordingId) as SegmentRow[];
}

export function getSpeakersByRecordingId(recordingId: string): SpeakerRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM speakers WHERE recording_id = ?`)
    .all(recordingId) as SpeakerRow[];
}

export function getSpeakersByRecordingIds(
  recordingIds: string[]
): Record<string, SpeakerRow[]> {
  if (recordingIds.length === 0) return {};

  const db = getDb();
  const placeholders = recordingIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT * FROM speakers WHERE recording_id IN (${placeholders})`
    )
    .all(...recordingIds) as SpeakerRow[];

  return rows.reduce<Record<string, SpeakerRow[]>>((acc, row) => {
    if (!acc[row.recording_id]) acc[row.recording_id] = [];
    acc[row.recording_id].push(row);
    return acc;
  }, {});
}

export function getAllUniqueSpeakers(): { name: string; color: string; count: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT name, color, COUNT(DISTINCT recording_id) as count
       FROM speakers
       GROUP BY name
       ORDER BY count DESC, name ASC`
    )
    .all() as { name: string; color: string; count: number }[];
}

export function searchRecordingsWithSpeaker(
  query: string,
  speakerName: string,
  source?: "zoom" | "gong" | "all"
): RecordingRow[] {
  const db = getDb();
  const searchTerm = `%${escapeLikeWildcards(query)}%`;
  const sourceFilter = source && source !== "all" ? source : null;

  if (query.trim()) {
    // Search with both text query and speaker filter
    if (sourceFilter) {
      return db
        .prepare(
          `SELECT DISTINCT r.* FROM recordings r
           INNER JOIN speakers sp ON r.id = sp.recording_id
           LEFT JOIN segments s ON r.id = s.recording_id
           WHERE r.duration >= 60
             AND r.source = ?
             AND sp.name = ?
             AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
           ORDER BY r.created_at DESC`
        )
        .all(sourceFilter, speakerName, searchTerm, searchTerm, searchTerm, searchTerm) as RecordingRow[];
    }
    return db
      .prepare(
        `SELECT DISTINCT r.* FROM recordings r
         INNER JOIN speakers sp ON r.id = sp.recording_id
         LEFT JOIN segments s ON r.id = s.recording_id
         WHERE r.duration >= 60
           AND sp.name = ?
           AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
         ORDER BY r.created_at DESC`
      )
      .all(speakerName, searchTerm, searchTerm, searchTerm, searchTerm) as RecordingRow[];
  } else {
    // Just filter by speaker
    if (sourceFilter) {
      return db
        .prepare(
          `SELECT DISTINCT r.* FROM recordings r
           INNER JOIN speakers sp ON r.id = sp.recording_id
           WHERE r.duration >= 60 AND r.source = ? AND sp.name = ?
           ORDER BY r.created_at DESC`
        )
        .all(sourceFilter, speakerName) as RecordingRow[];
    }
    return db
      .prepare(
        `SELECT DISTINCT r.* FROM recordings r
         INNER JOIN speakers sp ON r.id = sp.recording_id
         WHERE r.duration >= 60 AND sp.name = ?
         ORDER BY r.created_at DESC`
      )
      .all(speakerName) as RecordingRow[];
  }
}

export function getVideoFilesByRecordingId(recordingId: string): VideoFileRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM video_files WHERE recording_id = ?`)
    .all(recordingId) as VideoFileRow[];
}

export function getChatMessagesByRecordingId(recordingId: string): ChatMessageRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM chat_messages WHERE recording_id = ? ORDER BY timestamp`)
    .all(recordingId) as ChatMessageRow[];
}

// Transform DB rows to app types
export function dbRowToRecording(
  row: RecordingRow,
  segments: SegmentRow[],
  speakers: SpeakerRow[],
  accessToken?: string
): Recording {
  // Only append access token for Zoom recordings (Gong URLs are pre-signed S3 URLs)
  const videoUrl =
    accessToken && row.source === "zoom"
      ? `${row.video_url}?access_token=${accessToken}`
      : row.video_url;

  return {
    id: row.id,
    title: row.title,
    customTitle: row.custom_title ?? undefined,
    description: row.description ?? undefined,
    videoUrl,
    posterUrl: undefined,
    duration: row.duration,
    space: row.space,
    source: row.source || "zoom",
    mediaType: (row.media_type as "video" | "audio") || "video",
    createdAt: row.created_at,
    speakers: speakers.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
    })),
    transcript: segments.map((s) => ({
      id: s.id,
      startTime: s.start_time,
      endTime: s.end_time,
      speaker: s.speaker,
      text: s.text,
    })),
  };
}

// Insert/update functions for sync script
export function upsertRecording(recording: {
  id: string;
  title: string;
  description?: string;
  videoUrl: string;
  duration: number;
  space: string;
  source?: string;
  mediaType?: string;
  mediaUrlExpiresAt?: string;
  createdAt: string;
}): void {
  const db = getDb();
  // Use INSERT ... ON CONFLICT to preserve custom_title when syncing
  db.prepare(
    `INSERT INTO recordings (id, title, description, video_url, duration, space, source, media_type, media_url_expires_at, created_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       video_url = excluded.video_url,
       duration = excluded.duration,
       space = excluded.space,
       source = excluded.source,
       media_type = excluded.media_type,
       media_url_expires_at = excluded.media_url_expires_at,
       synced_at = excluded.synced_at`
  ).run(
    recording.id,
    recording.title,
    recording.description ?? null,
    recording.videoUrl,
    recording.duration,
    recording.space,
    recording.source ?? "zoom",
    recording.mediaType ?? "video",
    recording.mediaUrlExpiresAt ?? null,
    recording.createdAt,
    new Date().toISOString()
  );
}

export function deleteRecordingData(recordingId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM segments WHERE recording_id = ?`).run(recordingId);
  db.prepare(`DELETE FROM speakers WHERE recording_id = ?`).run(recordingId);
  db.prepare(`DELETE FROM video_files WHERE recording_id = ?`).run(recordingId);
  db.prepare(`DELETE FROM chat_messages WHERE recording_id = ?`).run(recordingId);
}

export function insertSegments(
  recordingId: string,
  segments: TranscriptSegment[]
): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO segments (id, recording_id, start_time, end_time, speaker, text)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((segs: TranscriptSegment[]) => {
    for (const seg of segs) {
      stmt.run(
        `${recordingId}-${seg.id}`,
        recordingId,
        seg.startTime,
        seg.endTime,
        seg.speaker,
        seg.text
      );
    }
  });

  insertMany(segments);
}

export function insertSpeakers(recordingId: string, speakers: Speaker[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO speakers (id, recording_id, name, color)
     VALUES (?, ?, ?, ?)`
  );

  const insertMany = db.transaction((spks: Speaker[]) => {
    for (const spk of spks) {
      stmt.run(`${recordingId}-${spk.id}`, recordingId, spk.name, spk.color);
    }
  });

  insertMany(speakers);
}

export function insertVideoFiles(
  recordingId: string,
  videoFiles: { viewType: string; videoUrl: string }[]
): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO video_files (id, recording_id, view_type, video_url)
     VALUES (?, ?, ?, ?)`
  );

  const insertMany = db.transaction(
    (files: { viewType: string; videoUrl: string }[]) => {
      for (const file of files) {
        stmt.run(
          `${recordingId}-${file.viewType}`,
          recordingId,
          file.viewType,
          file.videoUrl
        );
      }
    }
  );

  insertMany(videoFiles);
}

export interface ChatMessage {
  id: string;
  timestamp: number;
  sender: string;
  message: string;
}

export function insertChatMessages(
  recordingId: string,
  messages: ChatMessage[]
): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO chat_messages (id, recording_id, timestamp, sender, message)
     VALUES (?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((msgs: ChatMessage[]) => {
    for (const msg of msgs) {
      stmt.run(
        `${recordingId}-${msg.id}`,
        recordingId,
        msg.timestamp,
        msg.sender,
        msg.message
      );
    }
  });

  insertMany(messages);
}

export function getSummaryByRecordingId(recordingId: string): SummaryRow | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM summaries WHERE recording_id = ?`)
    .get(recordingId) as SummaryRow | undefined;
}

export function upsertSummary(summary: {
  recordingId: string;
  content: string;
  model: string;
}): void {
  const db = getDb();
  const id = `summary-${summary.recordingId}`;
  db.prepare(
    `INSERT OR REPLACE INTO summaries (id, recording_id, content, model, generated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    id,
    summary.recordingId,
    summary.content,
    summary.model,
    new Date().toISOString()
  );
}

// Clip functions
export function dbRowToClip(row: ClipRow): Clip {
  return {
    id: row.id,
    recordingId: row.recording_id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
  };
}

export function getAllClips(): ClipRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT c.* FROM clips c
       INNER JOIN recordings r ON c.recording_id = r.id
       ORDER BY c.created_at DESC`
    )
    .all() as ClipRow[];
}

export interface ClipWithRecordingRow extends ClipRow {
  recording_title: string;
}

export function getAllClipsWithRecordingTitle(): ClipWithRecordingRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT c.*, COALESCE(r.custom_title, r.title) as recording_title
       FROM clips c
       INNER JOIN recordings r ON c.recording_id = r.id
       ORDER BY c.created_at DESC`
    )
    .all() as ClipWithRecordingRow[];
}

export function getClipById(id: string): ClipRow | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM clips WHERE id = ?`)
    .get(id) as ClipRow | undefined;
}

export function getClipsByRecordingId(recordingId: string): ClipRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM clips WHERE recording_id = ? ORDER BY start_time`)
    .all(recordingId) as ClipRow[];
}

function generateClipTitle(recordingId: string, startTime: number, endTime: number): string | null {
  const db = getDb();
  const segments = db
    .prepare(
      `SELECT text FROM transcript_segments
       WHERE recording_id = ? AND start_time < ? AND end_time > ?
       ORDER BY start_time
       LIMIT 5`
    )
    .all(recordingId, endTime, startTime) as { text: string }[];

  if (segments.length === 0) return null;

  const combinedText = segments.map((s) => s.text).join(" ");
  if (combinedText.length <= 60) return combinedText;
  return combinedText.slice(0, 57) + "...";
}

export function insertClip(clip: {
  id: string;
  recordingId: string;
  title?: string;
  startTime: number;
  endTime: number;
}): ClipRow {
  const db = getDb();
  const title = clip.title || generateClipTitle(clip.recordingId, clip.startTime, clip.endTime);
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO clips (id, recording_id, title, start_time, end_time, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(clip.id, clip.recordingId, title, clip.startTime, clip.endTime, createdAt);

  return {
    id: clip.id,
    recording_id: clip.recordingId,
    title,
    start_time: clip.startTime,
    end_time: clip.endTime,
    created_at: createdAt,
  };
}

export function deleteClip(id: string): boolean {
  const db = getDb();
  const result = db.prepare(`DELETE FROM clips WHERE id = ?`).run(id);
  return result.changes > 0;
}


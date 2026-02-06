// Cloudflare D1 Database Layer
// This replaces better-sqlite3 with D1 bindings for Cloudflare Workers

import type {
  RecordingRow,
  SegmentRow,
  SpeakerRow,
  VideoFileRow,
  ChatMessageRow,
  SummaryRow,
  ClipRow,
  ParticipantRow,
  PaginatedResult,
  ClipWithRecordingRow,
} from "./index";

// Get D1 database from Cloudflare bindings
export function getDb(): D1Database {
  // In Cloudflare Workers, the DB binding is available on the request context
  // This will be populated by the Next.js route handlers
  if (typeof process !== "undefined" && process.env.DB) {
    return (process.env as { DB: D1Database }).DB;
  }
  throw new Error("D1 database not available. Make sure DB binding is configured in wrangler.toml");
}

// Escape SQL LIKE wildcards in user input
function escapeLikeWildcards(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

// Query functions
export async function getAllRecordings(): Promise<RecordingRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM recordings WHERE duration >= 60 ORDER BY created_at DESC`)
    .all<RecordingRow>();
  return result.results ?? [];
}

export async function getRecordingsBySource(
  source: "zoom" | "gong" | "all"
): Promise<RecordingRow[]> {
  const db = getDb();
  if (source === "all") {
    return getAllRecordings();
  }
  const result = await db
    .prepare(
      `SELECT * FROM recordings WHERE duration >= 60 AND source = ? ORDER BY created_at DESC`
    )
    .bind(source)
    .all<RecordingRow>();
  return result.results ?? [];
}

export async function getTotalRecordingsCount(
  source: "zoom" | "gong" | "all" = "all"
): Promise<number> {
  const db = getDb();
  let result;
  if (source === "all") {
    result = await db
      .prepare(`SELECT COUNT(*) as count FROM recordings WHERE duration >= 60`)
      .first();
  } else {
    result = await db
      .prepare(
        `SELECT COUNT(*) as count FROM recordings WHERE duration >= 60 AND source = ?`
      )
      .bind(source)
      .first();
  }
  return (result as unknown as { count: number }).count;
}

export async function getRecordingsPaginated(
  source: "zoom" | "gong" | "all",
  limit: number = 20,
  cursor?: string
): Promise<PaginatedResult<RecordingRow>> {
  const db = getDb();
  const sourceFilter = source !== "all" ? "AND source = ?" : "";

  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    const parts = cursor.split("|");
    cursorCreatedAt = parts[0];
    cursorId = parts[1] || null;
  }

  const cursorFilter = cursorCreatedAt
    ? cursorId
      ? "AND (created_at < ? OR (created_at = ? AND id < ?))"
      : "AND created_at < ?"
    : "";

  let query = db.prepare(
    `SELECT * FROM recordings
     WHERE duration >= 60 ${sourceFilter} ${cursorFilter}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  );

  if (source !== "all" && cursorCreatedAt && cursorId) {
    query = query.bind(source, cursorCreatedAt, cursorCreatedAt, cursorId, limit + 1);
  } else if (source !== "all" && cursorCreatedAt) {
    query = query.bind(source, cursorCreatedAt, limit + 1);
  } else if (source !== "all") {
    query = query.bind(source, limit + 1);
  } else if (cursorCreatedAt && cursorId) {
    query = query.bind(cursorCreatedAt, cursorCreatedAt, cursorId, limit + 1);
  } else if (cursorCreatedAt) {
    query = query.bind(cursorCreatedAt, limit + 1);
  } else {
    query = query.bind(limit + 1);
  }

  const result = await query.all<RecordingRow>();
  const rows = result.results ?? [];

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

export async function updateMediaUrl(
  id: string,
  videoUrl: string,
  expiresAt: string
): Promise<void> {
  const db = getDb();
  await db
    .prepare(
      `UPDATE recordings SET video_url = ?, media_url_expires_at = ?, synced_at = ? WHERE id = ?`
    )
    .bind(videoUrl, expiresAt, new Date().toISOString(), id)
    .run();
}

export async function updateRecordingCustomTitle(
  id: string,
  customTitle: string | null
): Promise<void> {
  const db = getDb();
  await db
    .prepare(`UPDATE recordings SET custom_title = ? WHERE id = ?`)
    .bind(customTitle, id)
    .run();
}

export async function searchRecordings(
  query: string,
  source?: "zoom" | "gong" | "all"
): Promise<RecordingRow[]> {
  const db = getDb();
  const searchTerm = `%${escapeLikeWildcards(query)}%`;

  let stmt;
  if (source && source !== "all") {
    stmt = db
      .prepare(
        `SELECT DISTINCT r.* FROM recordings r
         LEFT JOIN segments s ON r.id = s.recording_id
         WHERE r.duration >= 60 AND r.source = ? AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
         ORDER BY r.created_at DESC`
      )
      .bind(source, searchTerm, searchTerm, searchTerm, searchTerm);
  } else {
    stmt = db
      .prepare(
        `SELECT DISTINCT r.* FROM recordings r
         LEFT JOIN segments s ON r.id = s.recording_id
         WHERE r.duration >= 60 AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
         ORDER BY r.created_at DESC`
      )
      .bind(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const result = await stmt.all<RecordingRow>();
  return result.results ?? [];
}

export async function getRecordingById(id: string): Promise<RecordingRow | undefined> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM recordings WHERE id = ?`)
    .bind(id)
    .first<RecordingRow>();
  return result ?? undefined;
}

export async function getSegmentsByRecordingId(recordingId: string): Promise<SegmentRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM segments WHERE recording_id = ? ORDER BY start_time`)
    .bind(recordingId)
    .all<SegmentRow>();
  return result.results ?? [];
}

export async function getSpeakersByRecordingId(recordingId: string): Promise<SpeakerRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM speakers WHERE recording_id = ?`)
    .bind(recordingId)
    .all<SpeakerRow>();
  return result.results ?? [];
}

export async function getVideoFilesByRecordingId(recordingId: string): Promise<VideoFileRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM video_files WHERE recording_id = ?`)
    .bind(recordingId)
    .all<VideoFileRow>();
  return result.results ?? [];
}

export async function getChatMessagesByRecordingId(recordingId: string): Promise<ChatMessageRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM chat_messages WHERE recording_id = ? ORDER BY timestamp`)
    .bind(recordingId)
    .all<ChatMessageRow>();
  return result.results ?? [];
}

export async function getSummaryByRecordingId(recordingId: string): Promise<SummaryRow | undefined> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM summaries WHERE recording_id = ?`)
    .bind(recordingId)
    .first<SummaryRow>();
  return result ?? undefined;
}

export async function upsertSummary(summary: {
  recordingId: string;
  content: string;
  model: string;
}): Promise<void> {
  const db = getDb();
  const id = `summary-${summary.recordingId}`;
  await db
    .prepare(
      `INSERT OR REPLACE INTO summaries (id, recording_id, content, model, generated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      summary.recordingId,
      summary.content,
      summary.model,
      new Date().toISOString()
    )
    .run();
}

export async function getParticipantsByRecordingId(recordingId: string): Promise<ParticipantRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM participants WHERE recording_id = ?`)
    .bind(recordingId)
    .all<ParticipantRow>();
  return result.results ?? [];
}

export async function getAllUniqueSpeakers(): Promise<{ name: string; color: string; count: number }[]> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT name, color, COUNT(DISTINCT recording_id) as count
       FROM speakers
       GROUP BY name
       ORDER BY count DESC, name ASC`
    )
    .all<{ name: string; color: string; count: number }>();
  return result.results ?? [];
}

export async function getAllUniqueParticipants(): Promise<{ email: string; name: string; count: number }[]> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT email, name, COUNT(DISTINCT recording_id) as count
       FROM participants
       WHERE email IS NOT NULL AND email != ''
       GROUP BY email
       ORDER BY count DESC, name ASC`
    )
    .all<{ email: string; name: string; count: number }>();
  return result.results ?? [];
}

// Clip functions
export async function getAllClipsWithRecordingTitle(): Promise<ClipWithRecordingRow[]> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT c.*, COALESCE(r.custom_title, r.title) as recording_title
       FROM clips c
       INNER JOIN recordings r ON c.recording_id = r.id
       ORDER BY c.created_at DESC`
    )
    .all<ClipWithRecordingRow>();
  return result.results ?? [];
}

export async function getClipById(id: string): Promise<ClipRow | undefined> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM clips WHERE id = ?`)
    .bind(id)
    .first<ClipRow>();
  return result ?? undefined;
}

export async function getClipsByRecordingId(recordingId: string): Promise<ClipRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM clips WHERE recording_id = ? ORDER BY start_time`)
    .bind(recordingId)
    .all<ClipRow>();
  return result.results ?? [];
}

export async function insertClip(clip: {
  id: string;
  recordingId: string;
  title?: string;
  startTime: number;
  endTime: number;
}): Promise<ClipRow> {
  const db = getDb();
  const title = clip.title || null;
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO clips (id, recording_id, title, start_time, end_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(clip.id, clip.recordingId, title, clip.startTime, clip.endTime, createdAt)
    .run();

  return {
    id: clip.id,
    recording_id: clip.recordingId,
    title,
    start_time: clip.startTime,
    end_time: clip.endTime,
    created_at: createdAt,
  };
}

export async function deleteClip(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .prepare(`DELETE FROM clips WHERE id = ?`)
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

export async function getRelatedRecordings(title: string, excludeId: string): Promise<RecordingRow[]> {
  const GENERIC_TITLES = [
    "Google Calendar Meeting (not synced)",
    "Zoom Meeting",
    "Personal Meeting Room",
  ];

  if (GENERIC_TITLES.includes(title)) {
    return [];
  }

  const db = getDb();
  const result = await db
    .prepare(
      `SELECT * FROM recordings
       WHERE title = ? AND id != ? AND duration >= 60
       ORDER BY created_at DESC`
    )
    .bind(title, excludeId)
    .all<RecordingRow>();
  return result.results ?? [];
}

import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Recording, TranscriptSegment, Speaker } from "@/types/video";

const DB_PATH = join(process.cwd(), "data", "recordings.db");

let db: Database.Database | null = null;

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
    db.exec(schema);
  }
  return db;
}

export interface RecordingRow {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  duration: number;
  space: string;
  created_at: string;
  synced_at: string;
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

// Query functions
export function getAllRecordings(): RecordingRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM recordings WHERE duration >= 60 ORDER BY created_at DESC`)
    .all() as RecordingRow[];
}

// Escape SQL LIKE wildcards in user input
function escapeLikeWildcards(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

export function searchRecordings(query: string): RecordingRow[] {
  const db = getDb();
  const searchTerm = `%${escapeLikeWildcards(query)}%`;

  // Search in titles and transcript text
  return db
    .prepare(
      `SELECT DISTINCT r.* FROM recordings r
       LEFT JOIN segments s ON r.id = s.recording_id
       WHERE r.duration >= 60 AND (r.title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
       ORDER BY r.created_at DESC`
    )
    .all(searchTerm, searchTerm, searchTerm) as RecordingRow[];
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
  speakerName: string
): RecordingRow[] {
  const db = getDb();
  const searchTerm = `%${escapeLikeWildcards(query)}%`;

  if (query.trim()) {
    // Search with both text query and speaker filter
    return db
      .prepare(
        `SELECT DISTINCT r.* FROM recordings r
         INNER JOIN speakers sp ON r.id = sp.recording_id
         LEFT JOIN segments s ON r.id = s.recording_id
         WHERE r.duration >= 60
           AND sp.name = ?
           AND (r.title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
         ORDER BY r.created_at DESC`
      )
      .all(speakerName, searchTerm, searchTerm, searchTerm) as RecordingRow[];
  } else {
    // Just filter by speaker
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
  const videoUrl = accessToken
    ? `${row.video_url}?access_token=${accessToken}`
    : row.video_url;

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    videoUrl,
    posterUrl: undefined,
    duration: row.duration,
    space: row.space,
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
  createdAt: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO recordings (id, title, description, video_url, duration, space, created_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    recording.id,
    recording.title,
    recording.description ?? null,
    recording.videoUrl,
    recording.duration,
    recording.space,
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

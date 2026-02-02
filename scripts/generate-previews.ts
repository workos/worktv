import { config } from "dotenv";
import Database from "better-sqlite3";
import { execSync, spawn } from "child_process";
import { mkdirSync, existsSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import { getCall } from "@/lib/gong/calls";
import { isGongConfigured } from "@/lib/gong/auth";

// Load .env.local file
config({ path: join(process.cwd(), ".env.local") });

// Config
const DB_PATH = join(process.cwd(), "data", "recordings.db");
const PREVIEWS_DIR = join(process.cwd(), "public", "previews");
const TEMP_DIR = join(process.cwd(), ".preview-temp");

// GIF settings
const GIF_DURATION = 3; // seconds
const GIF_WIDTH = 320; // pixels
const GIF_FPS = 10;
const NUM_CANDIDATES = 5;
const FFMPEG_TIMEOUT_MS = 12000; // 12 seconds per GIF extraction
const MAX_RETRIES = 1; // retry failed extractions once

// Default parallelism settings (can be overridden via CLI args)
const DEFAULT_PARALLEL_RECORDINGS = 3;
const DEFAULT_PARALLEL_GIFS = 3;

// Timing stats (aggregated across all recordings)
const timingStats = {
  urlFetch: [] as number[],
  gifExtraction: [] as number[],
  aiSelection: [] as number[],
  total: [] as number[],
  timeouts: 0,
  retriesAttempted: 0,
  retriesSucceeded: 0,
};

// Recording results for final summary
interface RecordingResult {
  id: string;
  title: string;
  source: "Zoom" | "Gong" | "Other";
  status: "success" | "failed" | "no-url" | "no-gifs" | "error";
  duration: number;
  error?: string;
}
const recordingResults: RecordingResult[] = [];

// Logging helper - buffers logs and prints them all at once when flush() is called
// This prevents interleaved output when processing recordings in parallel
function createLogger(index: number, total: number, title: string, source: string) {
  const shortTitle = title.length > 40 ? title.slice(0, 37) + "..." : title;
  const prefix = `[${(index + 1).toString().padStart(2)}/${total}]`;
  const lines: string[] = [];

  return {
    start: () => lines.push(`${prefix} [${source}] "${shortTitle}"`),
    step: (emoji: string, msg: string) => lines.push(`${prefix}    ${emoji} ${msg}`),
    detail: (msg: string) => lines.push(`${prefix}       ${msg}`),
    success: (msg: string) => lines.push(`${prefix}    ✅ ${msg}`),
    fail: (msg: string) => lines.push(`${prefix}    ❌ ${msg}`),
    flush: () => {
      console.log("\n" + lines.join("\n"));
    },
  };
}

// Format milliseconds to human-readable string
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(1);
  return `${mins}m ${secs}s`;
}

// Parse numeric arg like --arg=N
function parseNumericArg(prefix: string, defaultValue: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return arg ? parseInt(arg.split("=")[1], 10) : defaultValue;
}

interface RecordingRow {
  id: string;
  title: string;
  video_url: string;
  duration: number;
  preview_gif_url: string | null;
}

// Parallel processing helper with concurrency limit
async function processInParallel<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];
      results[index] = await fn(item, index);
    }
  }

  // Start workers
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

// Zoom OAuth
async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Missing Zoom credentials in environment variables");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "account_credentials",
      account_id: accountId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Zoom OAuth failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch fresh Zoom recording details with download token
interface ZoomRecordingFile {
  file_type: string;
  recording_type: string;
  download_url: string;
  status: string;
}

interface ZoomRecordingDetails {
  recording_files: ZoomRecordingFile[];
  download_access_token?: string;
}

const VIEW_PRIORITY = [
  "shared_screen_with_speaker_view",
  "active_speaker",
  "speaker_view",
  "gallery_view",
  "shared_screen",
];

async function getZoomRecordingUrl(
  accessToken: string,
  meetingUuid: string
): Promise<string | null> {
  const encodedId =
    meetingUuid.startsWith("/") || meetingUuid.includes("//")
      ? encodeURIComponent(encodeURIComponent(meetingUuid))
      : encodeURIComponent(meetingUuid);

  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${encodedId}/recordings?include_fields=download_access_token`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as ZoomRecordingDetails;
  const downloadToken = data.download_access_token;

  // Find best video file
  const files = data.recording_files || [];
  let videoFile: ZoomRecordingFile | undefined;

  for (const type of VIEW_PRIORITY) {
    videoFile = files.find(
      (f) =>
        f.file_type === "MP4" &&
        f.recording_type === type &&
        f.status === "completed"
    );
    if (videoFile) break;
  }

  if (!videoFile) {
    videoFile = files.find((f) => f.file_type === "MP4" && f.status === "completed");
  }

  if (!videoFile) {
    return null;
  }

  // Return URL with download token
  return downloadToken
    ? `${videoFile.download_url}?access_token=${downloadToken}`
    : videoFile.download_url;
}

// Generate candidate timestamps, avoiding first/last 10% of video
function getCandidateTimestamps(duration: number, count: number): number[] {
  const startBuffer = duration * 0.1;
  const endBuffer = duration * 0.9;
  const usableDuration = endBuffer - startBuffer;

  const timestamps: number[] = [];
  for (let i = 0; i < count; i++) {
    // Spread timestamps evenly across usable portion
    const offset = (usableDuration / (count + 1)) * (i + 1);
    timestamps.push(Math.floor(startBuffer + offset));
  }

  return timestamps;
}

// Fetch fresh Gong media URL via API
async function getGongRecordingUrl(callId: string): Promise<string | null> {
  if (!isGongConfigured()) {
    return null;
  }

  try {
    const call = await getCall(callId, true);
    if (!call?.media) {
      return null;
    }
    // Prefer video over audio
    return call.media.videoUrl || call.media.audioUrl || null;
  } catch (err) {
    console.log(`     Gong API error: ${err}`);
    return null;
  }
}

// Extract a GIF clip using ffmpeg with HTTP Range seeking
// Both Zoom and Gong S3 URLs support Range requests, so ffmpeg can seek directly
const DEBUG_FFMPEG = process.argv.includes("--debug");

interface ExtractGifOptions {
  videoUrl: string;
  startTime: number;
  outputPath: string;
  // Logging context
  recordingTitle: string;
  candidateNum: number;
  attemptNum: number;
  maxAttempts: number;
}

async function extractGif(opts: ExtractGifOptions): Promise<boolean> {
  const { videoUrl, startTime, outputPath, candidateNum } = opts;

  return new Promise((resolve) => {
    const ffmpegStart = Date.now();
    let resolved = false;

    const done = (success: boolean) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      resolve(success);
    };

    // Use -ss before -i for fast input seeking via HTTP Range requests
    const args = [
      ...(DEBUG_FFMPEG ? ["-loglevel", "debug"] : []),
      "-ss", startTime.toString(),
      "-i", videoUrl,
      "-t", GIF_DURATION.toString(),
      "-vf", `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1`,
      "-f", "gif",
      "-y",
      outputPath,
    ];

    if (DEBUG_FFMPEG) {
      console.log(`        [DEBUG] ffmpeg -ss ${startTime} -i [URL] ...`);
    }

    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
      if (DEBUG_FFMPEG) {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.includes("Range") || line.includes("HTTP") || line.includes("Opening") || line.includes("seekable")) {
            console.log(`        [DEBUG] ${line.trim()}`);
          }
        }
      }
    });

    ffmpeg.on("close", (code) => {
      const elapsed = Date.now() - ffmpegStart;
      if (code === 0 && existsSync(outputPath)) {
        if (DEBUG_FFMPEG) {
          const hadRangeRequest = stderr.includes("Range:") || stderr.includes("bytes=");
          const seekableDetected = stderr.includes("seekable: 1") || stderr.includes("is_streamed=0");
          console.log(`        [DEBUG] GIF ${candidateNum} done in ${elapsed}ms (Range: ${hadRangeRequest}, Seekable: ${seekableDetected})`);
        }
        done(true);
      } else {
        if (DEBUG_FFMPEG && stderr) {
          console.log(`        [DEBUG] GIF ${candidateNum} failed (exit=${code}): ${stderr.slice(-200)}`);
        }
        done(false);
      }
    });

    ffmpeg.on("error", (err) => {
      if (DEBUG_FFMPEG) {
        console.log(`        [DEBUG] GIF ${candidateNum} error: ${err.message}`);
      }
      done(false);
    });

    // Timeout - use SIGKILL for forceful termination
    const timeoutId = setTimeout(() => {
      if (resolved) return;
      timingStats.timeouts++;
      ffmpeg.kill("SIGKILL");
      // Clean up partial output file if it exists
      if (existsSync(outputPath)) {
        try {
          unlinkSync(outputPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      done(false);
    }, FFMPEG_TIMEOUT_MS);
  });
}

// Use Claude to pick the best GIF
async function pickBestGif(gifPaths: string[]): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || gifPaths.length === 0) {
    // No API key or no GIFs - return first one
    return 0;
  }

  if (gifPaths.length === 1) {
    return 0;
  }

  try {
    const client = new Anthropic({ apiKey });

    // Read GIFs as base64
    const images = gifPaths.map((path) => {
      const data = readFileSync(path);
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/gif" as const,
          data: data.toString("base64"),
        },
      };
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            ...images,
            {
              type: "text",
              text: `These are ${gifPaths.length} candidate preview GIFs for a video call recording. Pick the BEST one for a thumbnail preview. Consider:
- Shows people/faces (more engaging than screen shares)
- Has visual activity/movement
- Good image quality (not blurry)
- Professional/appropriate content

Reply with ONLY the number (1-${gifPaths.length}) of the best GIF. Nothing else.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/(\d+)/);
    if (match) {
      const index = parseInt(match[1], 10) - 1; // Convert 1-based to 0-based
      if (index >= 0 && index < gifPaths.length) {
        return index;
      }
    }
  } catch (err) {
    console.log(`     AI selection failed: ${err}`);
  }

  // Fallback: pick middle candidate
  return Math.floor(gifPaths.length / 2);
}

// Process a single recording
async function processRecording(
  db: Database.Database,
  recording: RecordingRow,
  accessToken: string,
  parallelGifs: number,
  index: number,
  total: number
): Promise<boolean> {
  const totalStart = Date.now();

  // Determine source type
  const isZoom = recording.id.startsWith("zoom_");
  const isGong = recording.id.startsWith("gong_");
  const source = isZoom ? "Zoom" : isGong ? "Gong" : "Other";
  const gongCallId = isGong ? recording.id.replace("gong_", "") : null;

  const log = createLogger(index, total, recording.title, source);
  log.start();

  // Create temp directory for this recording
  const tempDir = join(TEMP_DIR, recording.id.replace(/[^a-zA-Z0-9]/g, "_"));
  mkdirSync(tempDir, { recursive: true });

  let videoSource: string;
  let timestamps: number[];

  try {
    // --- URL Fetching ---
    const urlStart = Date.now();

    if (isZoom) {
      // Zoom: fetch one URL, reuse for all extractions (supports concurrent Range requests)
      const meetingUuid = recording.id.replace("zoom_", "");
      log.step("🔗", "Fetching video URL...");
      const videoUrl = await getZoomRecordingUrl(accessToken, meetingUuid);
      if (!videoUrl) {
        log.fail("Could not get video URL");
        log.flush();
        recordingResults.push({ id: recording.id, title: recording.title, source, status: "no-url", duration: Date.now() - totalStart });
        return false;
      }
      videoSource = videoUrl;
    } else if (isGong) {
      // Gong: verify API access, but fetch fresh URL per extraction (URLs may not support concurrent use)
      log.step("🔗", "Verifying API access...");
      const testUrl = await getGongRecordingUrl(gongCallId!);
      if (!testUrl) {
        log.fail("Could not get video URL");
        log.flush();
        recordingResults.push({ id: recording.id, title: recording.title, source, status: "no-url", duration: Date.now() - totalStart });
        return false;
      }
      videoSource = ""; // Will fetch fresh URL per extraction
    } else {
      // For other sources, use the stored URL
      videoSource = recording.video_url;
    }
    timestamps = getCandidateTimestamps(recording.duration, NUM_CANDIDATES);
    const urlElapsed = Date.now() - urlStart;
    timingStats.urlFetch.push(urlElapsed);
    log.step("✓", `URL ready (${formatDuration(urlElapsed)})`);

    // --- GIF Extraction ---
    log.step("🎞️", `Extracting ${timestamps.length} GIF candidates...`);

    const extractStart = Date.now();

    const extractionResults = await processInParallel(
      timestamps,
      async (timestamp, i) => {
        const outputPath = join(tempDir, `candidate_${i}.gif`);
        const maxAttempts = MAX_RETRIES + 1;

        // Retry loop for failed extractions
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          let urlToUse = videoSource;

          // For Gong, fetch fresh URL for each extraction (and retry)
          if (gongCallId) {
            const freshUrl = await getGongRecordingUrl(gongCallId);
            if (!freshUrl) {
              return null;
            }
            urlToUse = freshUrl;
          }

          // Track retry attempts
          if (attempt > 1) {
            timingStats.retriesAttempted++;
          }

          const success = await extractGif({
            videoUrl: urlToUse,
            startTime: timestamp,
            outputPath,
            recordingTitle: recording.title,
            candidateNum: i + 1,
            attemptNum: attempt,
            maxAttempts,
          });

          if (success) {
            if (attempt > 1) {
              timingStats.retriesSucceeded++;
            }
            return outputPath;
          }
        }

        return null;
      },
      parallelGifs
    );

    const extractElapsed = Date.now() - extractStart;
    timingStats.gifExtraction.push(extractElapsed);

    const candidatePaths = extractionResults.filter((p): p is string => p !== null);

    if (candidatePaths.length === 0) {
      log.fail(`No GIFs extracted (0/${timestamps.length})`);
      log.flush();
      recordingResults.push({ id: recording.id, title: recording.title, source, status: "no-gifs", duration: Date.now() - totalStart });
      return false;
    }

    log.step("✓", `Extracted ${candidatePaths.length}/${timestamps.length} GIFs (${formatDuration(extractElapsed)})`);

    // --- AI Selection ---
    log.step("🤖", "Selecting best preview...");
    const aiStart = Date.now();
    const bestIndex = await pickBestGif(candidatePaths);
    const aiElapsed = Date.now() - aiStart;
    timingStats.aiSelection.push(aiElapsed);

    // Copy best GIF to public directory
    const baseFilename = recording.id.replace(/[^a-zA-Z0-9]/g, "_");
    const gifFilename = `${baseFilename}.gif`;
    const posterFilename = `${baseFilename}.jpg`;
    const gifPath = join(PREVIEWS_DIR, gifFilename);
    const posterPath = join(PREVIEWS_DIR, posterFilename);

    execSync(`cp "${candidatePaths[bestIndex]}" "${gifPath}"`);

    // Extract first frame as poster image
    execSync(
      `ffmpeg -i "${gifPath}" -vframes 1 -y "${posterPath}" 2>/dev/null`
    );

    // Update database with both URLs
    const previewUrl = `/previews/${gifFilename}`;
    const posterUrl = `/previews/${posterFilename}`;
    db.prepare(`UPDATE recordings SET preview_gif_url = ?, poster_url = ? WHERE id = ?`).run(
      previewUrl,
      posterUrl,
      recording.id
    );

    const totalElapsed = Date.now() - totalStart;
    timingStats.total.push(totalElapsed);
    log.success(`Done in ${formatDuration(totalElapsed)} (GIF #${bestIndex + 1} selected)`);
    log.flush();
    recordingResults.push({ id: recording.id, title: recording.title, source, status: "success", duration: totalElapsed });
    return true;
  } finally {
    // Cleanup temp files
    try {
      const files = readdirSync(tempDir);
      for (const file of files) {
        unlinkSync(join(tempDir, file));
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Main function
async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const gongOnly = process.argv.includes("--gong-only");
  const zoomOnly = process.argv.includes("--zoom-only");
  const limit = parseNumericArg("limit", 0) || undefined;
  const parallelRecordings = parseNumericArg("parallel", DEFAULT_PARALLEL_RECORDINGS);
  const parallelGifs = parseNumericArg("parallel-gifs", DEFAULT_PARALLEL_GIFS);

  console.log("🎬 Starting preview GIF generation...\n");
  console.log(`   Parallelism: ${parallelRecordings} recordings × ${parallelGifs} GIFs`);
  if (gongOnly) console.log(`   Filter: Gong recordings only`);
  if (zoomOnly) console.log(`   Filter: Zoom recordings only`);
  console.log();

  // Check for ffmpeg
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
  } catch {
    console.error("❌ ffmpeg not found. Please install it first:");
    console.error("   brew install ffmpeg");
    process.exit(1);
  }

  // Ensure directories exist
  mkdirSync(PREVIEWS_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  // Open database
  const db = new Database(DB_PATH);

  // Get recordings without previews (or all if force)
  let query = `SELECT id, title, video_url, duration, preview_gif_url
               FROM recordings
               WHERE duration >= 60`;

  if (!force) {
    query += ` AND (preview_gif_url IS NULL OR preview_gif_url = '')`;
  }

  if (gongOnly) {
    query += ` AND id LIKE 'gong_%'`;
  } else if (zoomOnly) {
    query += ` AND id LIKE 'zoom_%'`;
  }

  query += ` ORDER BY created_at DESC`;

  if (limit) {
    query += ` LIMIT ?`;
  }

  const recordings = (limit
    ? db.prepare(query).all(limit)
    : db.prepare(query).all()) as RecordingRow[];

  if (recordings.length === 0) {
    console.log("✅ All recordings already have preview GIFs!");
    db.close();
    return;
  }

  // Count sources
  const zoomCount = recordings.filter((r) => r.id.startsWith("zoom_")).length;
  const gongCount = recordings.filter((r) => r.id.startsWith("gong_")).length;
  const otherCount = recordings.length - zoomCount - gongCount;

  console.log(`Found ${recordings.length} recording(s) to process:`);
  if (zoomCount > 0) console.log(`   • ${zoomCount} Zoom`);
  if (gongCount > 0) console.log(`   • ${gongCount} Gong`);
  if (otherCount > 0) console.log(`   • ${otherCount} Other`);
  console.log();

  // Get Zoom access token only if we have Zoom recordings
  const hasZoomRecordings = zoomCount > 0;
  let accessToken = "";
  if (hasZoomRecordings) {
    console.log("🔑 Authenticating with Zoom...");
    accessToken = await getZoomAccessToken();
    console.log("   ✓ Authenticated\n");
  }

  // Process recordings in parallel
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Processing ${recordings.length} recordings (${parallelRecordings} parallel × ${parallelGifs} GIFs each)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const results = await processInParallel(
    recordings,
    async (recording, index) => {
      const isZoom = recording.id.startsWith("zoom_");
      const isGong = recording.id.startsWith("gong_");
      const source = isZoom ? "Zoom" : isGong ? "Gong" : "Other";
      try {
        return await processRecording(db, recording, accessToken, parallelGifs, index, recordings.length);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`[${(index + 1).toString().padStart(2)}/${recordings.length}] [${source.padEnd(4)}] ❌ Error: ${errMsg}`);
        recordingResults.push({
          id: recording.id,
          title: recording.title,
          source: source as "Zoom" | "Gong" | "Other",
          status: "error",
          duration: 0,
          error: errMsg,
        });
        return false;
      }
    },
    parallelRecordings
  );

  const success = results.filter((r) => r === true).length;
  const failed = results.filter((r) => r === false).length;

  // Print results summary table
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`RESULTS SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Group by status
  const successResults = recordingResults.filter((r) => r.status === "success");
  const failedResults = recordingResults.filter((r) => r.status !== "success");

  if (successResults.length > 0) {
    console.log(`\n✅ SUCCESS (${successResults.length}):`);
    for (const r of successResults) {
      const shortTitle = r.title.length > 50 ? r.title.slice(0, 47) + "..." : r.title;
      console.log(`   [${r.source.padEnd(4)}] ${shortTitle.padEnd(50)} ${formatDuration(r.duration).padStart(8)}`);
    }
  }

  if (failedResults.length > 0) {
    console.log(`\n❌ FAILED (${failedResults.length}):`);
    for (const r of failedResults) {
      const shortTitle = r.title.length > 45 ? r.title.slice(0, 42) + "..." : r.title;
      const reason = r.status === "no-url" ? "no URL" : r.status === "no-gifs" ? "no GIFs" : r.error || r.status;
      console.log(`   [${r.source.padEnd(4)}] ${shortTitle.padEnd(45)} → ${reason}`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`TOTALS: ${success} success, ${failed} failed`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Print timing statistics
  if (timingStats.total.length > 0) {
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : 0;
    const min = (arr: number[]) => arr.length > 0 ? Math.min(...arr) : 0;

    console.log(`\n📊 Timing Statistics (${timingStats.total.length} recordings):`);
    console.log(`   ┌─────────────────┬──────────┬──────────┬──────────┬──────────┐`);
    console.log(`   │ Step            │ Total    │ Avg      │ Min      │ Max      │`);
    console.log(`   ├─────────────────┼──────────┼──────────┼──────────┼──────────┤`);
    console.log(`   │ URL Fetch       │ ${formatDuration(sum(timingStats.urlFetch)).padEnd(8)} │ ${formatDuration(avg(timingStats.urlFetch)).padEnd(8)} │ ${formatDuration(min(timingStats.urlFetch)).padEnd(8)} │ ${formatDuration(max(timingStats.urlFetch)).padEnd(8)} │`);
    console.log(`   │ GIF Extraction  │ ${formatDuration(sum(timingStats.gifExtraction)).padEnd(8)} │ ${formatDuration(avg(timingStats.gifExtraction)).padEnd(8)} │ ${formatDuration(min(timingStats.gifExtraction)).padEnd(8)} │ ${formatDuration(max(timingStats.gifExtraction)).padEnd(8)} │`);
    console.log(`   │ AI Selection    │ ${formatDuration(sum(timingStats.aiSelection)).padEnd(8)} │ ${formatDuration(avg(timingStats.aiSelection)).padEnd(8)} │ ${formatDuration(min(timingStats.aiSelection)).padEnd(8)} │ ${formatDuration(max(timingStats.aiSelection)).padEnd(8)} │`);
    console.log(`   ├─────────────────┼──────────┼──────────┼──────────┼──────────┤`);
    console.log(`   │ Total/Recording │ ${formatDuration(sum(timingStats.total)).padEnd(8)} │ ${formatDuration(avg(timingStats.total)).padEnd(8)} │ ${formatDuration(min(timingStats.total)).padEnd(8)} │ ${formatDuration(max(timingStats.total)).padEnd(8)} │`);
    console.log(`   └─────────────────┴──────────┴──────────┴──────────┴──────────┘`);

    // Percentage breakdown
    const totalTime = sum(timingStats.total);
    if (totalTime > 0) {
      const urlPct = (sum(timingStats.urlFetch) / totalTime * 100).toFixed(1);
      const gifPct = (sum(timingStats.gifExtraction) / totalTime * 100).toFixed(1);
      const aiPct = (sum(timingStats.aiSelection) / totalTime * 100).toFixed(1);
      console.log(`\n   Time breakdown: URL ${urlPct}% | GIF ${gifPct}% | AI ${aiPct}%`);
    }

    // Timeout/retry statistics
    if (timingStats.timeouts > 0 || timingStats.retriesAttempted > 0) {
      console.log(`\n⏱ Timeout/Retry Statistics:`);
      console.log(`   Timeouts: ${timingStats.timeouts}`);
      console.log(`   Retries attempted: ${timingStats.retriesAttempted}`);
      console.log(`   Retries succeeded: ${timingStats.retriesSucceeded}`);
      if (timingStats.retriesAttempted > 0) {
        const retrySuccessRate = ((timingStats.retriesSucceeded / timingStats.retriesAttempted) * 100).toFixed(1);
        console.log(`   Retry success rate: ${retrySuccessRate}%`);
      }
    }
  }

  db.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
  });

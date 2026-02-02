/**
 * Test script to check if Gong/Zoom media URLs support concurrent HTTP Range requests
 *
 * Run: npx tsx scripts/test-gong-concurrent.ts [--zoom]
 */

import { config } from "dotenv";
import { join } from "path";
import Database from "better-sqlite3";
import { getCall } from "@/lib/gong/calls";
import { isGongConfigured } from "@/lib/gong/auth";

config({ path: join(process.cwd(), ".env.local") });

const DB_PATH = join(process.cwd(), "data", "recordings.db");
const useZoom = process.argv.includes("--zoom");

type RequestResult =
  | { index: number; success: true; status: number; elapsed: number; contentLength: string | null; acceptRanges: string | null }
  | { index: number; success: false; status: number; elapsed: number; error: string };

async function testConcurrentAccess(url: string, concurrency: number): Promise<void> {
  console.log(`\n🧪 Testing ${concurrency} concurrent Range requests...`);

  // Each request fetches a different 1MB chunk
  const chunkSize = 1024 * 1024; // 1MB
  const requests = Array.from({ length: concurrency }, (_, i) => {
    const start = i * chunkSize;
    const end = start + chunkSize - 1;
    return { index: i, start, end };
  });

  const startTime = Date.now();

  const results: RequestResult[] = await Promise.all(
    requests.map(async ({ index, start, end }): Promise<RequestResult> => {
      const reqStart = Date.now();
      try {
        const response = await fetch(url, {
          headers: {
            Range: `bytes=${start}-${end}`,
          },
        });

        const elapsed = Date.now() - reqStart;
        const status = response.status;
        const contentLength = response.headers.get("content-length");
        const acceptRanges = response.headers.get("accept-ranges");

        // Consume body to complete request
        await response.arrayBuffer();

        return {
          index,
          success: true,
          status,
          elapsed,
          contentLength,
          acceptRanges,
        };
      } catch (err) {
        return {
          index,
          success: false,
          status: 0,
          elapsed: Date.now() - reqStart,
          error: String(err),
        };
      }
    })
  );

  const totalElapsed = Date.now() - startTime;
  const successful = results.filter(r => r.success).length;

  console.log(`\n   Results (${totalElapsed}ms total):`);
  for (const r of results) {
    if (r.success) {
      console.log(`   ✓ Request ${r.index + 1}: HTTP ${r.status}, ${r.contentLength} bytes, ${r.elapsed}ms`);
    } else {
      console.log(`   ✗ Request ${r.index + 1}: HTTP ${r.status}, ${r.elapsed}ms - ${r.error}`);
    }
  }

  console.log(`\n   Summary: ${successful}/${concurrency} successful`);

  if (results[0]?.acceptRanges) {
    console.log(`   Accept-Ranges header: ${results[0].acceptRanges}`);
  }
}

// Zoom OAuth helper (copied from generate-previews.ts)
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
    throw new Error(`Zoom OAuth failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getZoomRecordingUrl(accessToken: string, meetingUuid: string): Promise<string | null> {
  const encodedId = meetingUuid.startsWith("/") || meetingUuid.includes("//")
    ? encodeURIComponent(encodeURIComponent(meetingUuid))
    : encodeURIComponent(meetingUuid);

  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${encodedId}/recordings?include_fields=download_access_token`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) return null;

  const data = await response.json();
  const downloadToken = data.download_access_token;
  const videoFile = data.recording_files?.find((f: any) => f.file_type === "MP4" && f.status === "completed");

  if (!videoFile) return null;

  return downloadToken
    ? `${videoFile.download_url}?access_token=${downloadToken}`
    : videoFile.download_url;
}

async function main() {
  const source = useZoom ? "Zoom" : "Gong";
  console.log(`🔍 Testing ${source} URL concurrent access...\n`);

  const db = new Database(DB_PATH);
  let videoUrl: string;
  let fetchUrl: () => Promise<string | null>;

  if (useZoom) {
    // Zoom mode
    const recording = db.prepare(`
      SELECT id FROM recordings
      WHERE id LIKE 'zoom_%' AND duration > 60
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as { id: string } | undefined;
    db.close();

    if (!recording) {
      console.error("❌ No Zoom recordings found in database");
      process.exit(1);
    }

    const meetingUuid = recording.id.replace("zoom_", "");
    console.log(`📹 Using Zoom meeting: ${meetingUuid}`);

    console.log("🔄 Fetching Zoom access token...");
    const accessToken = await getZoomAccessToken();

    console.log("🔄 Fetching media URL from Zoom API...");
    const url = await getZoomRecordingUrl(accessToken, meetingUuid);
    if (!url) {
      console.error("❌ No video URL available for this recording");
      process.exit(1);
    }
    videoUrl = url;
    fetchUrl = () => getZoomRecordingUrl(accessToken, meetingUuid);

  } else {
    // Gong mode
    if (!isGongConfigured()) {
      console.error("❌ Gong not configured. Set GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET.");
      console.error("   Or use --zoom to test with Zoom instead.");
      process.exit(1);
    }

    const recording = db.prepare(`
      SELECT id FROM recordings
      WHERE id LIKE 'gong_%' AND duration > 60
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as { id: string } | undefined;
    db.close();

    if (!recording) {
      console.error("❌ No Gong recordings found in database");
      process.exit(1);
    }

    const callId = recording.id.replace("gong_", "");
    console.log(`📹 Using Gong call: ${callId}`);

    console.log("🔄 Fetching media URL from Gong API...");
    const call = await getCall(callId, true);

    if (!call?.media?.videoUrl) {
      console.error("❌ No video URL available for this call");
      process.exit(1);
    }

    videoUrl = call.media.videoUrl;
    fetchUrl = async () => {
      const c = await getCall(callId, true);
      return c?.media?.videoUrl || null;
    };
  }

  console.log(`✓ Got video URL (${videoUrl.substring(0, 80)}...)`);

  // Test with increasing concurrency
  for (const concurrency of [1, 2, 3, 5]) {
    await testConcurrentAccess(videoUrl, concurrency);
  }

  // Test with fresh URLs per request (simulating the current Gong behavior)
  console.log(`\n\n🧪 Testing with fresh URLs per request (current script behavior for Gong)...`);
  const freshUrls = await Promise.all(
    Array.from({ length: 3 }, () => fetchUrl())
  );

  console.log(`   Fetched 3 fresh URLs:`);
  const uniqueUrls = new Set(freshUrls.filter(Boolean));
  console.log(`   - Unique URLs: ${uniqueUrls.size} (${uniqueUrls.size === 1 ? 'same URL each time' : 'different URLs'})`);

  // Check if URLs have expiring tokens
  const urlObj = new URL(videoUrl);
  const params = Object.fromEntries(urlObj.searchParams.entries());
  if (params['X-Amz-Expires'] || params['Expires']) {
    console.log(`   - URL expiry: ${params['X-Amz-Expires'] || params['Expires']} seconds`);
  }

  console.log("\n✅ Test complete!");
}

main().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});

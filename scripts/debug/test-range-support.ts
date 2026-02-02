#!/usr/bin/env npx tsx
/**
 * Test script to verify HTTP Range request support for Zoom and Gong video URLs.
 *
 * This script:
 * 1. Fetches fresh video URLs from both Zoom and Gong APIs
 * 2. Tests each URL for Range request support using curl
 * 3. Reports findings
 */

import { config } from "dotenv";
import { execSync } from "child_process";
import { join } from "path";
import Database from "better-sqlite3";

// Load environment
config({ path: join(process.cwd(), ".env.local") });

const DB_PATH = join(process.cwd(), "data", "recordings.db");

// ============ Zoom Functions ============

async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Missing Zoom credentials");
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
  const files = data.recording_files || [];

  const videoFile = files.find((f: any) => f.file_type === "MP4" && f.status === "completed");
  if (!videoFile) return null;

  return downloadToken
    ? `${videoFile.download_url}?access_token=${downloadToken}`
    : videoFile.download_url;
}

// ============ Gong Functions ============

function isGongConfigured(): boolean {
  return !!(process.env.GONG_ACCESS_KEY && process.env.GONG_ACCESS_KEY_SECRET);
}

async function getGongMediaUrl(callId: string): Promise<string | null> {
  if (!isGongConfigured()) return null;

  const accessKey = process.env.GONG_ACCESS_KEY!;
  const accessKeySecret = process.env.GONG_ACCESS_KEY_SECRET!;
  const baseUrl = process.env.GONG_BASE_URL || "https://api.gong.io";
  const credentials = Buffer.from(`${accessKey}:${accessKeySecret}`).toString("base64");

  // Need to request media URLs explicitly
  const response = await fetch(
    `${baseUrl}/v2/calls/extensive`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          callIds: [callId],
        },
        contentSelector: {
          exposedFields: {
            media: true,
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.log(`  Gong API error: ${response.status} - ${text.slice(0, 200)}`);
    return null;
  }

  const data = await response.json();
  const call = data.calls?.[0];
  if (!call) {
    console.log(`  Gong API: No call found for ID ${callId}`);
    return null;
  }

  const videoUrl = call.media?.videoUrl;
  const audioUrl = call.media?.audioUrl;

  console.log(`  Media URLs found: video=${!!videoUrl}, audio=${!!audioUrl}`);

  return videoUrl || audioUrl || null;
}

// ============ FFmpeg Direct Test ============

async function testFfmpegDirectExtract(service: string, url: string): Promise<void> {
  console.log(`\n  Testing FFmpeg direct extraction on ${service} URL...`);
  console.log(`  URL: ${url.substring(0, 80)}...`);

  const outputPath = `/tmp/ffmpeg-direct-test-${Date.now()}.gif`;

  // Try to extract a 2-second GIF starting at 5 seconds, directly from the URL
  // No HEAD request, no pre-check - just pass the URL straight to FFmpeg
  // Use -loglevel debug to see HTTP requests FFmpeg makes
  const ffmpegCmd = [
    "ffmpeg",
    "-y",                          // Overwrite output
    "-loglevel", "debug",          // Show HTTP traffic
    "-ss", "5",                    // Seek to 5 seconds (before -i for fast seek)
    "-i", `"${url}"`,              // Input URL directly
    "-t", "2",                     // Duration: 2 seconds
    "-vf", "fps=10,scale=320:-1",  // 10fps, 320px wide
    "-f", "gif",                   // Output format
    `"${outputPath}"`,
    "2>&1"                         // Capture stderr
  ].join(" ");

  console.log(`  → Running: ffmpeg -loglevel debug -ss 5 -i [URL] -t 2 ... [output]`);

  try {
    const startTime = Date.now();
    const output = execSync(ffmpegCmd, {
      encoding: "utf-8",
      timeout: 60000,  // 60 second timeout
      shell: "/bin/bash",
    });

    const elapsed = Date.now() - startTime;

    // Look for Range-related lines in the debug output
    const lines = output.split("\n");
    const httpLines = lines.filter((line: string) =>
      line.includes("Range") ||
      line.includes("range") ||
      line.includes("HTTP") ||
      line.includes("Content-Range") ||
      line.includes("Accept-Ranges") ||
      line.includes("seekable") ||
      line.includes("Seeking")
    );

    if (httpLines.length > 0) {
      console.log(`\n  📡 HTTP/Seeking activity from FFmpeg debug:`);
      for (const line of httpLines.slice(0, 20)) {
        console.log(`     ${line.trim()}`);
      }
    }

    // Check if output file was created and get its size
    try {
      const statOutput = execSync(`stat -f%z "${outputPath}"`, { encoding: "utf-8" });
      const fileSize = parseInt(statOutput.trim(), 10);

      console.log(`\n  ✅ SUCCESS! GIF created in ${elapsed}ms`);
      console.log(`     Output file: ${outputPath}`);
      console.log(`     File size: ${fileSize} bytes`);

      // Clean up
      execSync(`rm -f "${outputPath}"`, { encoding: "utf-8" });
    } catch {
      console.log(`  ❌ FFmpeg ran but no output file created`);
      console.log(`     FFmpeg output: ${output.slice(0, 500)}`);
    }
  } catch (err: any) {
    // FFmpeg exits with non-zero even on success sometimes, check if file was created
    const output = err.stdout || err.stderr || "";

    // Look for Range-related lines in the debug output
    const lines = output.split("\n");
    const httpLines = lines.filter((line: string) =>
      line.includes("Range") ||
      line.includes("range") ||
      line.includes("HTTP") ||
      line.includes("Content-Range") ||
      line.includes("Accept-Ranges") ||
      line.includes("seekable") ||
      line.includes("Seeking")
    );

    if (httpLines.length > 0) {
      console.log(`\n  📡 HTTP/Seeking activity from FFmpeg debug:`);
      for (const line of httpLines.slice(0, 20)) {
        console.log(`     ${line.trim()}`);
      }
    }

    // Check if output file was actually created despite the "error"
    try {
      const statOutput = execSync(`stat -f%z "${outputPath}"`, { encoding: "utf-8" });
      const fileSize = parseInt(statOutput.trim(), 10);
      if (fileSize > 0) {
        console.log(`\n  ✅ SUCCESS! GIF created (${fileSize} bytes)`);
        execSync(`rm -f "${outputPath}"`, { encoding: "utf-8" });
        return;
      }
    } catch { }

    console.log(`  ❌ FFmpeg FAILED`);
    console.log(`     Error: ${err.message?.slice(0, 200) || err}`);

    // Clean up any partial output
    try {
      execSync(`rm -f "${outputPath}"`, { encoding: "utf-8" });
    } catch { }
  }
}

// ============ Test Functions ============

interface RangeTestResult {
  service: string;
  url: string;
  headersCheck: {
    acceptRanges: string | null;
    contentLength: string | null;
    contentType: string | null;
  };
  rangeRequestCheck: {
    statusCode: number;
    contentRange: string | null;
    bytesReceived: number;
  };
  supportsRange: boolean;
}

async function testRangeSupport(service: string, url: string): Promise<RangeTestResult> {
  console.log(`\n  Testing ${service} URL...`);
  console.log(`  URL: ${url.substring(0, 80)}...`);

  let headersCheck = {
    acceptRanges: null as string | null,
    contentLength: null as string | null,
    contentType: null as string | null,
    finalUrl: null as string | null,
  };

  let rangeRequestCheck = {
    statusCode: 0,
    contentRange: null as string | null,
    bytesReceived: 0,
  };

  // Single combined test: Make ONE request with Range header, capture headers and body
  // This works for single-use URLs (like Gong) that can only be accessed once
  console.log("  → Testing with single Range request (bytes=0-10000)...");

  try {
    // Use -D to dump headers to a file, then we can parse both headers and check body size
    const tempHeaderFile = `/tmp/range-test-headers-${Date.now()}.txt`;

    // Single request: follow redirects, send Range header, dump headers, get body
    const output = execSync(
      `curl -sL -D "${tempHeaderFile}" -H "Range: bytes=0-10000" -o /tmp/range-test-body.bin "${url}" && cat "${tempHeaderFile}" && echo "---BODY_SIZE---" && wc -c < /tmp/range-test-body.bin`,
      { encoding: "utf-8", timeout: 30000 }
    );

    const parts = output.split("---BODY_SIZE---");
    const headersPart = parts[0] || "";
    const bodySize = parseInt((parts[1] || "0").trim(), 10);

    rangeRequestCheck.bytesReceived = bodySize;

    // Parse headers (get last response after redirects)
    const responses = headersPart.split(/(?=HTTP\/)/);
    const lastResponse = responses[responses.length - 1] || headersPart;

    const lines = lastResponse.split("\n");
    for (const line of lines) {
      if (line.startsWith("HTTP/")) {
        const match = line.match(/HTTP\/[\d.]+ (\d+)/);
        if (match) rangeRequestCheck.statusCode = parseInt(match[1], 10);
      }
      const lower = line.toLowerCase();
      if (lower.startsWith("accept-ranges:")) {
        headersCheck.acceptRanges = line.split(":")[1]?.trim() || null;
      }
      if (lower.startsWith("content-length:")) {
        headersCheck.contentLength = line.split(":")[1]?.trim() || null;
      }
      if (lower.startsWith("content-type:")) {
        headersCheck.contentType = line.split(":")[1]?.trim() || null;
      }
      if (lower.startsWith("content-range:")) {
        rangeRequestCheck.contentRange = line.split(":")[1]?.trim() || null;
      }
    }

    // Cleanup temp files
    try {
      execSync(`rm -f "${tempHeaderFile}" /tmp/range-test-body.bin`, { encoding: "utf-8" });
    } catch { }

    console.log(`    Status Code: ${rangeRequestCheck.statusCode}`);
    console.log(`    Accept-Ranges: ${headersCheck.acceptRanges || "(not present)"}`);
    console.log(`    Content-Length: ${headersCheck.contentLength || "(not present)"}`);
    console.log(`    Content-Type: ${headersCheck.contentType || "(not present)"}`);
    console.log(`    Content-Range: ${rangeRequestCheck.contentRange || "(not present)"}`);
    console.log(`    Bytes Received: ${rangeRequestCheck.bytesReceived}`);
  } catch (err) {
    console.log(`    Request failed: ${err}`);
  }

  // Determine if Range is supported
  // 206 = Partial Content (Range supported)
  // 200 with full file = Range ignored
  // 403 = Forbidden (might be single-use or expired)
  const supportsRange =
    rangeRequestCheck.statusCode === 206 ||
    (headersCheck.acceptRanges === "bytes" && rangeRequestCheck.bytesReceived <= 1100);

  console.log(`  ✓ Range Support: ${supportsRange ? "YES" : "NO"}`);
  if (rangeRequestCheck.statusCode === 403) {
    console.log(`    ⚠️  Got 403 - URL may be single-use or expired`);
  }

  return {
    service,
    url,
    headersCheck,
    rangeRequestCheck,
    supportsRange,
  };
}

// ============ Main ============

async function main() {
  console.log("🔍 Testing HTTP Range Request Support\n");
  console.log("=" .repeat(60));

  const results: RangeTestResult[] = [];

  // Get a sample recording from the database
  const db = new Database(DB_PATH);

  // Test Zoom
  console.log("\n📹 ZOOM");
  console.log("-".repeat(60));
  try {
    const zoomRecording = db.prepare(
      `SELECT id FROM recordings WHERE id LIKE 'zoom_%' ORDER BY created_at DESC LIMIT 1`
    ).get() as { id: string } | undefined;

    if (zoomRecording) {
      const meetingUuid = zoomRecording.id.replace("zoom_", "");
      console.log(`  Recording ID: ${zoomRecording.id}`);

      console.log("  → Getting fresh access token...");
      const accessToken = await getZoomAccessToken();

      console.log("  → Getting fresh video URL...");
      const url = await getZoomRecordingUrl(accessToken, meetingUuid);

      if (url) {
        const result = await testRangeSupport("Zoom", url);
        results.push(result);
      } else {
        console.log("  ❌ Could not get Zoom URL");
      }
    } else {
      console.log("  ❌ No Zoom recordings found in database");
    }
  } catch (err) {
    console.log(`  ❌ Zoom test failed: ${err}`);
  }

  // Test Gong
  console.log("\n📞 GONG");
  console.log("-".repeat(60));
  try {
    if (!isGongConfigured()) {
      console.log("  ❌ Gong not configured (missing credentials)");
    } else {
      const gongRecording = db.prepare(
        `SELECT id FROM recordings WHERE id LIKE 'gong_%' ORDER BY created_at DESC LIMIT 1`
      ).get() as { id: string } | undefined;

      if (gongRecording) {
        const callId = gongRecording.id.replace("gong_", "");
        console.log(`  Recording ID: ${gongRecording.id}`);

        console.log("  → Getting fresh video URL...");
        const url = await getGongMediaUrl(callId);

        if (url) {
          const result = await testRangeSupport("Gong", url);
          results.push(result);
        } else {
          console.log("  ❌ Could not get Gong URL");
        }
      } else {
        console.log("  ❌ No Gong recordings found in database");
      }
    }
  } catch (err) {
    console.log(`  ❌ Gong test failed: ${err}`);
  }

  // Test FFmpeg direct extraction with Gong (fresh URL)
  console.log("\n🎬 FFMPEG DIRECT TEST (Gong)");
  console.log("-".repeat(60));
  try {
    if (!isGongConfigured()) {
      console.log("  ❌ Gong not configured (missing credentials)");
    } else {
      const gongRecording = db.prepare(
        `SELECT id FROM recordings WHERE id LIKE 'gong_%' ORDER BY created_at DESC LIMIT 1`
      ).get() as { id: string } | undefined;

      if (gongRecording) {
        const callId = gongRecording.id.replace("gong_", "");
        console.log(`  Recording ID: ${gongRecording.id}`);

        console.log("  → Getting FRESH video URL (not reusing previous)...");
        const freshUrl = await getGongMediaUrl(callId);

        if (freshUrl) {
          await testFfmpegDirectExtract("Gong", freshUrl);
        } else {
          console.log("  ❌ Could not get Gong URL");
        }
      } else {
        console.log("  ❌ No Gong recordings found in database");
      }
    }
  } catch (err) {
    console.log(`  ❌ FFmpeg direct test failed: ${err}`);
  }

  db.close();

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));

  for (const r of results) {
    console.log(`\n${r.service}:`);
    console.log(`  Accept-Ranges header: ${r.headersCheck.acceptRanges || "not present"}`);
    console.log(`  Range request status: ${r.rangeRequestCheck.statusCode}`);
    console.log(`  Supports Range: ${r.supportsRange ? "✅ YES" : "❌ NO"}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("RECOMMENDATIONS:");
  console.log("=".repeat(60));

  for (const r of results) {
    if (r.supportsRange) {
      console.log(`\n✅ ${r.service}: Use ffmpeg with -ss before -i for fast seeking`);
    } else if (r.rangeRequestCheck.statusCode === 403) {
      console.log(`\n⚠️  ${r.service}: URLs may be single-use. Download full segment with curl.`);
    } else {
      console.log(`\n❌ ${r.service}: No Range support. Must download sequentially.`);
    }
  }
}

main().catch(console.error);

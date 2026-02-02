import Anthropic from "@anthropic-ai/sdk";
import type { TranscriptSegment, AISummary } from "@/types/video";

const MODEL = "claude-haiku-4-5-20251001";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }
  return new Anthropic({ apiKey });
}

function formatTranscriptForPrompt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => `[${seg.speaker}]: ${seg.text}`)
    .join("\n");
}

const SUMMARY_PROMPT = `Summarize this meeting transcript.

1. BRIEF: Write a 1-2 sentence summary of what this meeting was about and who participated.

2. KEY POINTS: List up to 10 key points discussed. Be specific and concrete - avoid vague phrases.

3. NEXT STEPS: List any action items, follow-ups, or commitments made. Include who is responsible if mentioned. If none, return empty array.

Meeting transcript:
---
{transcript}
---

Return JSON only: {"brief": "string", "keyPoints": ["string", ...], "nextSteps": ["string", ...]}
All values must be strings. Do not use objects.`;

export async function generateTranscriptSummary(
  segments: TranscriptSegment[]
): Promise<AISummary> {
  if (segments.length === 0) {
    return {
      brief: "No transcript available for this recording.",
      keyPoints: [],
      nextSteps: [],
    };
  }

  const client = getClient();
  const transcript = formatTranscriptForPrompt(segments);
  const prompt = SUMMARY_PROMPT.replace("{transcript}", transcript);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192, // Max output for Haiku 4.5
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Strip markdown code block wrapper if present
  let jsonText = content.text.trim();
  if (jsonText.startsWith("```")) {
    // Remove opening ```json or ``` and closing ```
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed: AISummary;
  try {
    parsed = JSON.parse(jsonText) as AISummary;
  } catch (e) {
    throw new Error(`Failed to parse Claude's response as JSON: ${jsonText.slice(0, 200)}`);
  }

  // Validate the response shape
  if (
    typeof parsed.brief !== "string" ||
    !Array.isArray(parsed.keyPoints) ||
    !Array.isArray(parsed.nextSteps)
  ) {
    throw new Error("Invalid summary response format");
  }

  // Normalize: ensure all array items are strings
  const normalizeToString = (item: unknown): string => {
    if (typeof item === "string") return item;
    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      return obj.action as string || obj.text as string || JSON.stringify(item);
    }
    return String(item);
  };

  return {
    brief: parsed.brief,
    keyPoints: parsed.keyPoints.map(normalizeToString),
    nextSteps: parsed.nextSteps.map(normalizeToString),
  };
}

export { MODEL as SUMMARY_MODEL };

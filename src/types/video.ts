export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  timestamp: number;
  sender: string;
  message: string;
}

export interface AISummary {
  brief: string;
  keyPoints: string[];
  nextSteps: string[];
}

export interface Speaker {
  id: string;
  name: string;
  color: string;
}

export interface Recording {
  id: string;
  title: string;
  description?: string;
  videoUrl: string;
  posterUrl?: string;
  duration: number;
  space: string;
  createdAt: string;
  speakers: Speaker[];
  transcript: TranscriptSegment[];
  chatMessages?: ChatMessage[];
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function findCurrentSegment(
  segments: TranscriptSegment[],
  currentTime: number
): TranscriptSegment | null {
  return (
    segments.find((s) => currentTime >= s.startTime && currentTime < s.endTime) ??
    null
  );
}

function formatVttTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

export function generateVttFromTranscript(segments: TranscriptSegment[]): string {
  let vtt = "WEBVTT\n\n";

  for (const segment of segments) {
    const start = formatVttTime(segment.startTime);
    const end = formatVttTime(segment.endTime);
    vtt += `${start} --> ${end}\n`;
    vtt += `<v ${segment.speaker}>${segment.text}\n\n`;
  }

  return vtt;
}

export function createVttBlobUrl(segments: TranscriptSegment[]): string {
  const vtt = generateVttFromTranscript(segments);
  const blob = new Blob([vtt], { type: "text/vtt" });
  return URL.createObjectURL(blob);
}

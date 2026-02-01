import type {
  ZoomRecordingsListResponse,
  ZoomRecordingDetailResponse,
} from "@/types/zoom";
import { getZoomAccessToken } from "./auth";

const ZOOM_API_BASE = "https://api.zoom.us/v2";

async function zoomFetch<T>(endpoint: string): Promise<T> {
  const accessToken = await getZoomAccessToken();

  const response = await fetch(`${ZOOM_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Zoom API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<T>;
}

export async function listRecordings(
  userId: string = "me",
  options?: {
    from?: string;
    to?: string;
    pageSize?: number;
    nextPageToken?: string;
  }
): Promise<ZoomRecordingsListResponse> {
  const params = new URLSearchParams();

  // Default to last 30 days if no date range specified
  if (!options?.from) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    params.set("from", thirtyDaysAgo.toISOString().split("T")[0]);
  } else {
    params.set("from", options.from);
  }

  if (options?.to) params.set("to", options.to);
  if (options?.pageSize) params.set("page_size", options.pageSize.toString());
  if (options?.nextPageToken)
    params.set("next_page_token", options.nextPageToken);

  const query = params.toString();
  return zoomFetch<ZoomRecordingsListResponse>(
    `/users/${userId}/recordings${query ? `?${query}` : ""}`
  );
}

export async function getRecordingDetails(
  meetingId: string
): Promise<ZoomRecordingDetailResponse> {
  // Double-encode UUIDs that start with / or contain //
  const encodedMeetingId =
    meetingId.startsWith("/") || meetingId.includes("//")
      ? encodeURIComponent(encodeURIComponent(meetingId))
      : encodeURIComponent(meetingId);

  return zoomFetch<ZoomRecordingDetailResponse>(
    `/meetings/${encodedMeetingId}/recordings?include_fields=download_access_token`
  );
}

export async function getTranscriptContent(downloadUrl: string): Promise<string> {
  const accessToken = await getZoomAccessToken();

  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch transcript: ${response.status}`);
  }

  return response.text();
}

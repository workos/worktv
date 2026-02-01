export interface ZoomAccessToken {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  scope: string;
}

export interface ZoomRecordingFile {
  id: string;
  meeting_id: string;
  recording_start: string;
  recording_end: string;
  file_type: "MP4" | "M4A" | "TIMELINE" | "TRANSCRIPT" | "CHAT" | "CC" | "CSV";
  file_extension: string;
  file_size: number;
  play_url: string;
  download_url: string;
  status: "completed" | "processing";
  recording_type:
    | "shared_screen_with_speaker_view"
    | "shared_screen_with_speaker_view(CC)"
    | "shared_screen_with_gallery_view"
    | "speaker_view"
    | "gallery_view"
    | "shared_screen"
    | "audio_only"
    | "audio_transcript"
    | "active_speaker";
}

export interface ZoomMeeting {
  uuid: string;
  id: number;
  account_id: string;
  host_id: string;
  topic: string;
  type: number;
  start_time: string;
  timezone: string;
  duration: number;
  total_size: number;
  recording_count: number;
  share_url: string;
  recording_files: ZoomRecordingFile[];
  participant_audio_files?: ZoomRecordingFile[];
}

export interface ZoomRecordingsListResponse {
  from: string;
  to: string;
  page_count: number;
  page_size: number;
  total_records: number;
  next_page_token?: string;
  meetings: ZoomMeeting[];
}

export interface ZoomRecordingDetailResponse extends ZoomMeeting {
  download_access_token?: string;
}

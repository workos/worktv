<p align="center">
  <img src="public/logo.png" alt="WorkTV" width="200" />
</p>

# WorkTV

A powerful private video library for your team's meeting recordings. Sync recordings from Zoom and Gong, then browse, search, clip, and share with full transcript support and AI-powered summaries.

## Features

### Video Playback
- **Multi-View Recording Support** - Switch between Speaker View, Gallery View, Active Speaker, Shared Screen, and more without losing your place
- **Audio-Only Mode** - Dedicated audio player with visual waveform for audio-only recordings
- **Playback Speed Control** - 0.5x, 1x, 1.25x, 1.5x, and 2x playback speeds
- **Fullscreen Mode** - Immersive fullscreen playback
- **Volume Control** - Slider with mute toggle and keyboard shortcuts
- **Progress Seeking** - Click anywhere on the timeline to jump to that moment

### AI-Powered Features
- **Automatic Meeting Summaries** - Claude Haiku generates Gong-style summaries with brief overview, key points, and action items with owners
- **Smart Preview Thumbnails** - AI selects the best 3-second GIF preview from multiple candidates based on visual quality and content
- **AI Clip Titling** - Automatically generates descriptive titles for clips based on transcript content
- **Regenerate on Demand** - Re-run AI summary generation anytime with one click

### Clips & Sharing
- **Create Clips** - Select any segment of a recording with draggable timeline handles
- **Word-Level Precision** - Click transcript words to set clip boundaries with pinpoint accuracy
- **Shareable URLs** - Generate short, shareable links for any clip (`/c/{clipId}`)
- **Clips Browser** - Dedicated view to browse all clips across all recordings
- **Per-Recording Clips Panel** - See all clips for the current recording with quick navigation

### Transcripts & Captions
- **Full Transcript Panel** - Scrollable transcript with speaker names, timestamps, and color-coded speakers
- **Click-to-Seek** - Click any transcript line to jump to that exact moment in the video
- **Live Caption Overlay** - Toggle real-time captions over the video
- **Speaker Timeline** - Visual timeline showing who spoke when, with speaking time stats and percentages

### Search & Discovery
- **Full-Text Search** - Search across titles, descriptions, and transcript content
- **Speaker Filtering** - Type `@name` to filter by speaker (supports multiple speakers with AND logic)
- **Participant Email Search** - Find recordings by participant email address
- **Autocomplete** - Smart dropdown shows matching speakers and participants with recording counts
- **Keyboard Navigation** - Arrow keys to navigate results, Enter to select, `/` to focus search from anywhere

### Browse & View Modes
- **Grid View** - Visual card layout with animated GIF previews on hover
- **List View** - Detailed list with thumbnails and metadata
- **Calendar View** - 6-column calendar (Mon-Fri + Weekend) with month headers, today highlighting, and smooth scroll-to-today
- **Source Filtering** - Quick toggle between Zoom, Gong, or all recordings
- **Recording Count** - Always shows total videos matching your current filters

### Recording Details
- **Editable Titles** - Click to rename any recording with a custom title
- **Related Recordings** - Automatically shows other instances of recurring meetings
- **Participant List** - Full list of meeting attendees with names and emails
- **Chat Messages** - View the in-meeting chat alongside the video
- **Duration & Date** - Human-readable timestamps with timezone localization

### Animated Previews
- **GIF Thumbnails** - Animated 3-second preview plays on hover
- **Poster Images** - Static thumbnail when not hovering
- **AI-Selected** - Claude picks the best preview from 5 candidates at different timestamps
- **Parallel Generation** - Process multiple recordings simultaneously with configurable parallelism

### Data Sources

#### Zoom Integration
- **Server-to-Server OAuth** - Secure account-level API access
- **Multi-Year Sync** - Configurable lookback period (default: 3 years)
- **Complete Data Extraction** - Transcripts, chat logs, participants, meeting summaries, and all video views
- **Incremental Sync** - Smart sync skips recently-processed recordings
- **Access Token Refresh** - Automatic token refresh for uninterrupted playback

#### Gong Integration
- **API Integration** - Fetch calls, transcripts, and metadata
- **Media URL Caching** - Stores URLs with automatic expiry detection
- **URL Refresh** - Re-syncs expired media URLs automatically

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` / `K` | Play / Pause |
| `←` / `J` | Seek back 5 seconds |
| `→` / `L` | Seek forward 5 seconds |
| `↑` | Volume up 10% |
| `↓` | Volume down 10% |
| `M` | Toggle mute |
| `F` | Toggle fullscreen |
| `C` | Toggle captions |
| `/` | Focus search |

### Theme Support
- **Dark Mode** - Primary dark theme optimized for video viewing
- **Light Mode** - Clean light theme for daytime use
- **System Detection** - Automatically follows your OS preference
- **Manual Override** - Toggle in header persists your choice

### Performance
- **Infinite Scroll** - Recordings load as you scroll
- **Lazy Loading** - Images and GIFs load on demand
- **HTTP Range Requests** - ffmpeg seeks directly in remote videos without downloading
- **Parallel Processing** - Configurable concurrency for sync and preview generation
- **Database Caching** - SQLite with efficient queries and FTS search

### Technical Details
- **Multi-Angle Support** - Stores all video views (screen share, speaker, gallery, etc.)
- **Transcript Segments** - Individual segments with start/end times and speaker attribution
- **Speaker Colors** - Automatically assigns unique colors to each speaker
- **Media Type Detection** - Handles both video and audio-only recordings
- **Source Badges** - Visual indicators showing Zoom or Gong origin

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file with your credentials:
   ```env
   # Zoom Server-to-Server OAuth
   ZOOM_ACCOUNT_ID=your_account_id
   ZOOM_CLIENT_ID=your_client_id
   ZOOM_CLIENT_SECRET=your_client_secret

   # Gong (optional)
   GONG_ACCESS_KEY=your_access_key
   GONG_ACCESS_KEY_SECRET=your_secret

   # Anthropic API (for AI features)
   ANTHROPIC_API_KEY=your_api_key
   ```

3. Sync recordings:
   ```bash
   npm run sync
   ```

4. Generate preview thumbnails:
   ```bash
   npm run generate-previews
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run lint             # Run ESLint

# Data Sync
npm run sync             # Sync all sources (Zoom + Gong)
npm run sync -- --years=1    # Sync last N years
npm run sync -- --force      # Force re-sync all

# Preview Generation
npm run generate-previews                    # Generate missing previews
npm run generate-previews -- --force         # Regenerate all previews
npm run generate-previews -- --limit=10      # Process only N recordings
npm run generate-previews -- --parallel=5    # Configure parallelism
```

## Tech Stack

- [Next.js](https://nextjs.org) 16 with App Router
- [React](https://react.dev) 19
- [Tailwind CSS](https://tailwindcss.com) 4
- [SQLite](https://sqlite.org) via better-sqlite3
- [Anthropic Claude](https://anthropic.com) for AI features
- [Zoom Server-to-Server OAuth](https://developers.zoom.us/docs/internal-apps/s2s-oauth/)
- [Gong API](https://gong.io)
- [ffmpeg](https://ffmpeg.org) for preview generation

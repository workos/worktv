<p align="center">
  <img src="public/logo.png" alt="WorkOS TV" width="200" />
</p>

# WorkOS TV

A private video library for your Zoom meeting recordings. Sync recordings from Zoom, then browse, search, and watch with full transcript support.

## Features

- **Zoom Integration** - Automatically sync recordings, transcripts, chat logs, and AI summaries from Zoom
- **Full-Text Search** - Search across meeting titles, descriptions, and transcript content
- **Speaker Filtering** - Filter recordings by participant name
- **Transcript Playback** - Click any transcript line to jump to that moment in the video
- **Speaker Timeline** - Visual timeline showing who spoke when
- **Multiple Views** - Switch between speaker view, gallery view, shared screen, etc.
- **Chat Messages** - View meeting chat alongside the video
- **Captions** - Toggle captions generated from the transcript
- **Keyboard Shortcuts** - Space to play/pause, arrow keys to seek, and more
- **Dark/Light Theme** - System-aware theme with manual toggle

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file with your Zoom Server-to-Server OAuth credentials:
   ```
   ZOOM_ACCOUNT_ID=your_account_id
   ZOOM_CLIENT_ID=your_client_id
   ZOOM_CLIENT_SECRET=your_client_secret
   ```

3. Sync recordings from Zoom:
   ```bash
   npm run sync
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Sync Options

```bash
# Sync last 3 years (default)
npm run sync

# Sync last N years
npm run sync -- --years=1

# Force re-sync all recordings
npm run sync -- --force
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` | Seek back 5 seconds |
| `→` | Seek forward 5 seconds |
| `↑` | Volume up |
| `↓` | Volume down |
| `M` | Toggle mute |
| `F` | Toggle fullscreen |
| `C` | Toggle captions |

## Tech Stack

- [Next.js](https://nextjs.org) 16 with App Router
- [React](https://react.dev) 19
- [Tailwind CSS](https://tailwindcss.com) 4
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for local storage
- [Zoom Server-to-Server OAuth](https://developers.zoom.us/docs/internal-apps/s2s-oauth/) for API access

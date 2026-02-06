// Cloudflare Workers Environment Types

export interface CloudflareEnv {
  // D1 Database binding
  DB: D1Database;

  // Environment variables
  ANTHROPIC_API_KEY: string;
  ZOOM_ACCOUNT_ID?: string;
  ZOOM_CLIENT_ID?: string;
  ZOOM_CLIENT_SECRET?: string;
  GONG_ACCESS_KEY?: string;
  GONG_ACCESS_KEY_SECRET?: string;
}

// Extend Next.js Request to include Cloudflare bindings
declare global {
  namespace NodeJS {
    interface ProcessEnv extends CloudflareEnv {}
  }
}

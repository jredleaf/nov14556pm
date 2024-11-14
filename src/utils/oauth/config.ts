export const ZOOM_CONFIG = {
  AUTH_URL: 'https://zoom.us/oauth/authorize',
  TOKEN_URL: 'https://zoom.us/oauth/token',
  CLIENT_ID: import.meta.env.VITE_ZOOM_CLIENT_ID,
  CLIENT_SECRET: import.meta.env.VITE_ZOOM_CLIENT_SECRET,
  REDIRECT_URI: `${window.location.origin}/auth/callback`,
  STATE_EXPIRY_MINUTES: 10
} as const;
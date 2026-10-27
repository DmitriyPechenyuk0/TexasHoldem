/**
 * Every REST route of the api lives under this prefix, so one origin can serve the web app and the
 * api behind a reverse proxy (`/api/*` → api). socket.io keeps its own `/socket.io` path.
 */
export const API_PREFIX = "/api";

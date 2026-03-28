/**
 * Minimal structured logging for the API server (stdout/stderr).
 * Keeps startup and failure traces grep-friendly without extra dependencies.
 */
function ts(): string {
  return new Date().toISOString();
}

export const log = {
  info(msg: string): void {
    console.log(`[${ts()}] [snort] ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`[${ts()}] [snort:warn] ${msg}`);
  },
  error(msg: string, err?: unknown): void {
    if (err !== undefined) console.error(`[${ts()}] [snort:error] ${msg}`, err);
    else console.error(`[${ts()}] [snort:error] ${msg}`);
  }
};

/**
 * Minimal structured logging for the API server (stdout/stderr).
 * Keeps startup and failure traces grep-friendly without extra dependencies.
 */
function ts() {
  return new Date().toISOString();
}

export const log = {
  /** @param {string} msg */
  info(msg) {
    console.log(`[${ts()}] [snort] ${msg}`);
  },
  /** @param {string} msg */
  warn(msg) {
    console.warn(`[${ts()}] [snort:warn] ${msg}`);
  },
  /**
   * @param {string} msg
   * @param {unknown} [err]
   */
  error(msg, err) {
    if (err !== undefined) console.error(`[${ts()}] [snort:error] ${msg}`, err);
    else console.error(`[${ts()}] [snort:error] ${msg}`);
  }
};

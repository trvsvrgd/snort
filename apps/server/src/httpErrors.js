import { log } from "./logger.js";

/**
 * HTTP error with a stable status code and optional machine-facing `code`.
 */
export class HttpError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {{ code?: string, cause?: unknown }} [opts]
   */
  constructor(statusCode, message, opts = {}) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = opts.code;
  }
}

/**
 * Wraps an async Express handler so rejections reach `errorMiddleware`.
 * @param {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>} fn
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Maps common Node errors to short, actionable copy (Happy Pug tone for snorts).
 * @param {unknown} err
 */
export function userFacingMessage(err) {
  if (err instanceof HttpError) return err.message;
  if (err && typeof err === "object" && "code" in err) {
    const code = /** @type {{ code?: string }} */ (err).code;
    if (code === "ENOENT") {
      return "SNORT snorted—that file is not in the topics folder. Pick another topic or add the markdown file first.";
    }
    if (code === "EACCES" || code === "EPERM") {
      return "SNORT can't read or write there (permission denied). Check folder permissions for topics/history.";
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Express error middleware: JSON body, no stack leakage on 5xx.
 * @type {import("express").ErrorRequestHandler}
 */
export function errorMiddleware(err, _req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  let status = 500;
  /** @type {string} */
  let message = "Something went wrong in the kennel—check the server log for details.";
  /** @type {string | undefined} */
  let code;

  if (err instanceof HttpError) {
    status = err.statusCode;
    message = err.message;
    code = err.code;
  } else if (err && typeof err === "object" && "code" in err && /** @type {{ code?: string }} */ (err).code === "ENOENT") {
    status = 404;
    message = userFacingMessage(err);
  } else {
    log.error("Unhandled error", err);
  }

  res.status(status).json({ ok: false, error: message, code });
}

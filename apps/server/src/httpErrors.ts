import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { log } from "./logger.js";

export type HttpErrorOptions = { code?: string; cause?: unknown };

/** HTTP error with a stable status code and optional machine-facing `code`. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, opts: HttpErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = opts.code;
  }
}

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Wraps an async Express handler so rejections reach `errorMiddleware`. */
export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function nodeErrCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

/** Maps common Node errors to short, actionable copy (Happy Pug tone for snorts). */
export function userFacingMessage(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  const code = nodeErrCode(err);
  if (code === "ENOENT") {
    return "SNORT snorted—that file is not in the topics folder. Pick another topic or add the markdown file first.";
  }
  if (code === "EACCES" || code === "EPERM") {
    return "SNORT can't read or write there (permission denied). Check folder permissions for topics/history.";
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Express error middleware: JSON body, no stack leakage on 5xx. */
export const errorMiddleware: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  let status = 500;
  let message = "Something went wrong in the kennel—check the server log for details.";
  let code: string | undefined;

  if (err instanceof HttpError) {
    status = err.statusCode;
    message = err.message;
    code = err.code;
  } else if (nodeErrCode(err) === "ENOENT") {
    status = 404;
    message = userFacingMessage(err);
  } else {
    log.error("Unhandled error", err);
  }

  res.status(status).json({ ok: false, error: message, code });
};

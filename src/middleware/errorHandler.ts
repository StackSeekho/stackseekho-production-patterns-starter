import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export interface StandardErrorResponse {
  status: 'error';
  error: {
    code: string;
    message: string;
    requestId: string;
    timestamp: string;
    details?: unknown;
    stack?: string;
  };
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isAppErr = err instanceof AppError;
  const statusCode = isAppErr ? err.statusCode : 500;
  const code = isAppErr ? err.code : 'INTERNAL_SERVER_ERROR';
  const isOperational = isAppErr ? err.isOperational : false;

  let message = err.message || 'Internal server error';
  if (!isOperational && env.NODE_ENV === 'production') {
    message = 'An unexpected internal error occurred';
  }

  const logPayload = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    statusCode,
    code,
    isOperational,
    err,
  };

  if (statusCode >= 500) {
    logger.error(logPayload, `Request failed: ${message}`);
  } else {
    logger.warn(logPayload, `Client error: ${message}`);
  }

  const responseBody: StandardErrorResponse = {
    status: 'error',
    error: {
      code,
      message,
      requestId: String(req.id || 'unknown'),
      timestamp: new Date().toISOString(),
      ...(isAppErr && err.details !== undefined ? { details: err.details } : {}),
      ...(env.NODE_ENV !== 'production' && !isOperational && err.stack
        ? { stack: err.stack }
        : {}),
    },
  };

  res.status(statusCode).json(responseBody);
}

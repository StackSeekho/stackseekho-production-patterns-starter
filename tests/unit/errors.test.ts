import { describe, expect, it } from 'vitest';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
  isAppError,
} from '../../src/utils/errors';

describe('Error Hierarchy (errors.ts)', () => {
  it('should construct AppError with proper defaults and custom values', () => {
    const error = new AppError('Something went wrong', 418, 'TEAPOT', true, {
      extra: 'info',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.message).toBe('Something went wrong');
    expect(error.statusCode).toBe(418);
    expect(error.code).toBe('TEAPOT');
    expect(error.isOperational).toBe(true);
    expect(error.details).toEqual({ extra: 'info' });
  });

  it('should instantiate BadRequestError with status 400', () => {
    const error = new BadRequestError('Invalid payload', { field: 'email' });

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.isOperational).toBe(true);
    expect(error.details).toEqual({ field: 'email' });
  });

  it('should instantiate UnauthorizedError with status 401', () => {
    const error = new UnauthorizedError();

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('should instantiate ForbiddenError with status 403', () => {
    const error = new ForbiddenError();

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('should instantiate NotFoundError with status 404', () => {
    const error = new NotFoundError('User not found');

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('User not found');
  });

  it('should instantiate ConflictError with status 409', () => {
    const error = new ConflictError('User already exists');

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });

  it('should instantiate InternalServerError with status 500 and isOperational false', () => {
    const error = new InternalServerError();

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.isOperational).toBe(false);
  });

  it('should correctly identify AppError instances using isAppError', () => {
    expect(isAppError(new AppError('test'))).toBe(true);
    expect(isAppError(new BadRequestError('test'))).toBe(true);
    expect(isAppError(new Error('native error'))).toBe(false);
    expect(isAppError('string error')).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});

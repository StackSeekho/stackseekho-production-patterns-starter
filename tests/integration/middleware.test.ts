import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { errorHandler } from '../../src/middleware/errorHandler';
import { requestIdMiddleware } from '../../src/middleware/requestId';
import { BadRequestError } from '../../src/utils/errors';

describe('Middleware Integration Tests', () => {
  describe('Request ID Middleware', () => {
    it('should generate and return a new x-request-id header when none provided', async () => {
      const res = await request(app).get('/health');

      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should preserve and return client provided x-request-id header', async () => {
      const customId = 'client-custom-req-id-12345';
      const res = await request(app)
        .get('/health')
        .set('x-request-id', customId);

      expect(res.headers['x-request-id']).toBe(customId);
    });
  });

  describe('Centralized 404 Not Found Handler', () => {
    it('should return 404 with standard error structure for unknown routes', async () => {
      const res = await request(app).get('/api/v1/non-existent-route');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: 'Route GET /api/v1/non-existent-route not found',
          requestId: expect.any(String),
          timestamp: expect.any(String),
        },
      });
    });
  });

  describe('Centralized Error Handler', () => {
    it('should format AppError with specific status code and details', async () => {
      const testApp = express();
      testApp.use(requestIdMiddleware);
      testApp.get('/test-operational-error', () => {
        throw new BadRequestError('Invalid query parameter', {
          field: 'query',
          issue: 'missing',
        });
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get('/test-operational-error');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        status: 'error',
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid query parameter',
          requestId: expect.any(String),
          timestamp: expect.any(String),
          details: {
            field: 'query',
            issue: 'missing',
          },
        },
      });
    });

    it('should handle unhandled native errors with 500 status code', async () => {
      const testApp = express();
      testApp.use(requestIdMiddleware);
      testApp.get('/test-unexpected-error', () => {
        throw new Error('Unexpected database failure simulation');
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get('/test-unexpected-error');

      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.error.requestId).toBeDefined();
    });
  });
});

import express from 'express';
import knex from 'knex';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { healthService } from '../../src/modules/health/health.service';

describe('Health Endpoints (GET /health) with Database Integration', () => {
  it('GET /health should return 200 and report connected database status alongside application liveness', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('environment');

    // Application liveness is confirmed healthy
    expect(res.body.liveness).toEqual({
      status: 'up',
      healthy: true,
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });

    // Database readiness reports live connection with latency metrics
    expect(res.body.readiness).toMatchObject({
      status: 'ready',
      ready: true,
      services: {
        database: {
          status: 'connected',
          ready: true,
          latencyMs: expect.any(Number),
        },
      },
    });
    expect(res.body.readiness.services.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('GET /health/live should return 200 for application process liveness probe', async () => {
    const res = await request(app).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'up',
      healthy: true,
    });
    expect(typeof res.body.uptime).toBe('number');
  });

  it('GET /health/ready should return 200 when database is healthy', async () => {
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ready',
      ready: true,
      services: {
        database: {
          status: 'connected',
          ready: true,
        },
      },
    });
  });

  describe('Database Unavailable Behavior', () => {
    it('healthService should report status degraded and database disconnected when database is unavailable', async () => {
      // Create disconnected client
      const brokenDb = knex({
        client: 'pg',
        connection: {
          host: '127.0.0.1',
          port: 59998,
          user: 'nobody',
          password: 'bad',
          database: 'missing_db',
        },
        pool: { min: 0, max: 1, acquireTimeoutMillis: 500 },
      });

      try {
        const readiness = await healthService.getReadiness(brokenDb);

        expect(readiness.ready).toBe(false);
        expect(readiness.status).toBe('unready');
        expect(readiness.services.database.status).toBe('disconnected');
        expect(readiness.services.database.ready).toBe(false);
        expect(readiness.services.database.error).toBeDefined();

        const report = await healthService.getHealthReport(brokenDb);
        // Process liveness is STILL up even when database is degraded
        expect(report.liveness.healthy).toBe(true);
        expect(report.status).toBe('degraded');
        expect(report.readiness.ready).toBe(false);
      } finally {
        await brokenDb.destroy();
      }
    });

    it('readiness endpoint should return 503 when readiness probe fails', async () => {
      const brokenDb = knex({
        client: 'pg',
        connection: {
          host: '127.0.0.1',
          port: 59997,
          user: 'nobody',
          password: 'bad',
          database: 'missing_db',
        },
        pool: { min: 0, max: 1, acquireTimeoutMillis: 500 },
      });

      try {
        const testApp = express();
        testApp.get('/health/ready', async (_req, res) => {
          const readiness = await healthService.getReadiness(brokenDb);
          const statusCode = readiness.ready ? 200 : 503;
          res.status(statusCode).json(readiness);
        });

        const res = await request(testApp).get('/health/ready');

        expect(res.status).toBe(503);
        expect(res.body.ready).toBe(false);
        expect(res.body.status).toBe('unready');
        expect(res.body.services.database.status).toBe('disconnected');
      } finally {
        await brokenDb.destroy();
      }
    });
  });
});

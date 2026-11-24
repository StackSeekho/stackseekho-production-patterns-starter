import type { Knex } from 'knex';
import { env } from '../../config/env';
import {
  checkDatabaseReadiness,
  DatabaseHealthResult,
} from '../../database/connection';

export interface LivenessStatus {
  status: 'up';
  healthy: boolean;
  uptime: number;
  timestamp: string;
}

export interface DatabaseReadinessStatus {
  status: 'connected' | 'disconnected';
  ready: boolean;
  latencyMs?: number;
  error?: string;
}

export interface ReadinessStatus {
  status: 'ready' | 'unready';
  ready: boolean;
  timestamp: string;
  services: {
    database: DatabaseReadinessStatus;
  };
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  liveness: LivenessStatus;
  readiness: ReadinessStatus;
}

export class HealthService {
  public getLiveness(): LivenessStatus {
    return {
      status: 'up',
      healthy: true,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  public async getReadiness(dbClient?: Knex): Promise<ReadinessStatus> {
    const dbResult: DatabaseHealthResult =
      await checkDatabaseReadiness(dbClient);

    const isReady = dbResult.ready;

    return {
      status: isReady ? 'ready' : 'unready',
      ready: isReady,
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbResult.status,
          ready: dbResult.ready,
          ...(dbResult.latencyMs !== undefined
            ? { latencyMs: dbResult.latencyMs }
            : {}),
          ...(dbResult.error !== undefined ? { error: dbResult.error } : {}),
        },
      },
    };
  }

  public async getHealthReport(dbClient?: Knex): Promise<HealthReport> {
    const liveness = this.getLiveness();
    const readiness = await this.getReadiness(dbClient);

    return {
      status: readiness.ready ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: liveness.uptime,
      environment: env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      liveness,
      readiness,
    };
  }
}

export const healthService = new HealthService();

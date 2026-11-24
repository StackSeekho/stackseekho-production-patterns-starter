import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../src/config/env';

describe('Environment Validation (validateEnv)', () => {
  it('should parse valid environment with defaults including database configuration', () => {
    const parsed = validateEnv({});

    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.PORT).toBe(3000);
    expect(parsed.LOG_LEVEL).toBe('info');
    expect(parsed.CORS_ORIGIN).toBe('*');
    expect(parsed.DB_HOST).toBe('localhost');
    expect(parsed.DB_PORT).toBe(5432);
    expect(parsed.DB_USER).toBe('postgres');
    expect(parsed.DB_NAME).toBe('stackseekho_dev');
    expect(parsed.DB_POOL_MIN).toBe(2);
    expect(parsed.DB_POOL_MAX).toBe(10);
    expect(parsed.DB_SSL).toBe(false);
  });

  it('should coerce valid numeric strings for PORT and DB_PORT', () => {
    const parsed = validateEnv({
      PORT: '8080',
      DB_PORT: '5433',
    });

    expect(parsed.PORT).toBe(8080);
    expect(parsed.DB_PORT).toBe(5433);
  });

  it('should accept valid custom database configuration', () => {
    const parsed = validateEnv({
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      PORT: '4000',
      CORS_ORIGIN: 'https://example.com',
      DB_HOST: 'postgres.internal',
      DB_PORT: '5432',
      DB_USER: 'app_user',
      DB_PASSWORD: 'secure_password',
      DB_NAME: 'prod_db',
      DB_POOL_MIN: '5',
      DB_POOL_MAX: '20',
      DB_SSL: 'true',
    });

    expect(parsed.NODE_ENV).toBe('production');
    expect(parsed.LOG_LEVEL).toBe('warn');
    expect(parsed.PORT).toBe(4000);
    expect(parsed.CORS_ORIGIN).toBe('https://example.com');
    expect(parsed.DB_HOST).toBe('postgres.internal');
    expect(parsed.DB_USER).toBe('app_user');
    expect(parsed.DB_PASSWORD).toBe('secure_password');
    expect(parsed.DB_NAME).toBe('prod_db');
    expect(parsed.DB_POOL_MIN).toBe(5);
    expect(parsed.DB_POOL_MAX).toBe(20);
    expect(parsed.DB_SSL).toBe(true);
  });

  it('should throw an error when DB_POOL_MIN exceeds DB_POOL_MAX', () => {
    expect(() =>
      validateEnv({
        DB_POOL_MIN: '15',
        DB_POOL_MAX: '5',
      })
    ).toThrowError(/DB_POOL_MIN cannot exceed DB_POOL_MAX/);
  });

  it('should throw an error when PORT is not a valid integer', () => {
    expect(() =>
      validateEnv({
        PORT: 'invalid-port',
      })
    ).toThrowError(/Invalid environment configuration/);
  });

  it('should throw an error when PORT is out of range', () => {
    expect(() =>
      validateEnv({
        PORT: '70000',
      })
    ).toThrowError(/PORT must be between 1 and 65535/);

    expect(() =>
      validateEnv({
        PORT: '0',
      })
    ).toThrowError(/PORT must be between 1 and 65535/);
  });

  it('should throw an error for unsupported NODE_ENV values', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'staging',
      })
    ).toThrowError(/Invalid environment configuration/);
  });

  it('should throw an error for unsupported LOG_LEVEL values', () => {
    expect(() =>
      validateEnv({
        LOG_LEVEL: 'verbose',
      })
    ).toThrowError(/Invalid environment configuration/);
  });
});

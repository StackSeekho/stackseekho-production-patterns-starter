import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file into process.env before validation
dotenv.config();

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z
      .coerce
      .number()
      .int('PORT must be an integer')
      .min(1, 'PORT must be between 1 and 65535')
      .max(65535, 'PORT must be between 1 and 65535')
      .default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGIN: z.string().min(1).default('*'),

    // Database configuration
    DB_HOST: z.string().min(1, 'DB_HOST must not be empty').default('localhost'),
    DB_PORT: z
      .coerce
      .number()
      .int('DB_PORT must be an integer')
      .min(1, 'DB_PORT must be between 1 and 65535')
      .max(65535, 'DB_PORT must be between 1 and 65535')
      .default(5432),
    DB_USER: z.string().min(1, 'DB_USER must not be empty').default('postgres'),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().min(1, 'DB_NAME must not be empty').default('stackseekho_dev'),
    DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
    DB_SSL: z
      .union([z.boolean(), z.string()])
      .transform((val) => {
        if (typeof val === 'boolean') return val;
        return val.toLowerCase() === 'true' || val === '1';
      })
      .default(false),
  })
  .refine((data) => data.DB_POOL_MIN <= data.DB_POOL_MAX, {
    message: 'DB_POOL_MIN cannot exceed DB_POOL_MAX',
    path: ['DB_POOL_MIN'],
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(input: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration:\n${formattedErrors}`
    );
  }

  return result.data;
}

export const env: Env = validateEnv();

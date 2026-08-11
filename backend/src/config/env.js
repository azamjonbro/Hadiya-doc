import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS is required'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  CSRF_SECRET: z.string().min(16, 'CSRF_SECRET must be at least 16 characters'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  SUPERADMIN_EMAIL: z.string().email('SUPERADMIN_EMAIL must be a valid email'),
  SUPERADMIN_USERNAME: z.string().min(1, 'SUPERADMIN_USERNAME is required'),
  SUPERADMIN_PASSWORD: z.string().min(8, 'SUPERADMIN_PASSWORD must be at least 8 characters'),

  CAPTCHA_PROVIDER: z.enum(['hcaptcha']).default('hcaptcha'),
  CAPTCHA_SECRET: z.string().optional().default(''),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

  STORAGE_DRIVER: z.enum(['s3']).default('s3'),
  S3_ENDPOINT: z.string().min(1, 'S3_ENDPOINT is required'),
  S3_REGION: z.string().min(1, 'S3_REGION is required'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),
  S3_BUCKET_ORIGINALS: z.string().min(1, 'S3_BUCKET_ORIGINALS is required'),
  S3_BUCKET_PROCESSED: z.string().min(1, 'S3_BUCKET_PROCESSED is required'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = {
  ...parsed.data,
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
}

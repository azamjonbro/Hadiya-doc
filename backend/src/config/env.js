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

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  STORAGE_DRIVER: z.enum(['s3']).default('s3'),
  S3_ENDPOINT: z.string().min(1, 'S3_ENDPOINT is required'),
  S3_REGION: z.string().min(1, 'S3_REGION is required'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),
  S3_BUCKET_ORIGINALS: z.string().min(1, 'S3_BUCKET_ORIGINALS is required'),
  S3_BUCKET_PROCESSED: z.string().min(1, 'S3_BUCKET_PROCESSED is required'),
  // Unlike the video buckets (private, served only via signed playback
  // tokens), this one is public-read — avatars/covers/news images are
  // rendered directly via <img src> throughout the app, same as the
  // plain-URL fields already on the Course/News/User models.
  S3_BUCKET_IMAGES: z.string().min(1, 'S3_BUCKET_IMAGES is required'),
  // Optional — lets a production deploy serve images from a CDN/public
  // domain that differs from the internal S3_ENDPOINT. Defaults to
  // constructing the URL from S3_ENDPOINT directly (fine for local dev).
  S3_PUBLIC_URL: z.string().optional().default(''),

  // Private bucket — course materials (files/presentations/multimedia) are
  // only ever served via a short-lived signed URL, never a plain public one
  // (see materialAccess.service.js), unlike S3_BUCKET_IMAGES above.
  S3_BUCKET_MATERIALS: z.string().min(1, 'S3_BUCKET_MATERIALS is required'),
  MATERIAL_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(100),
  MATERIAL_DOWNLOAD_URL_TTL: z.coerce.number().int().positive().default(120),

  // Private bucket as well — a chat image/voice note/file is private
  // correspondence between two people, so it is only ever served through a
  // short-lived signed URL minted per message render. Defaulted (unlike
  // the buckets above) so an existing deployment does not fail boot when
  // it upgrades before touching its env file.
  S3_BUCKET_CHAT: z.string().min(1).default('lms-chat'),
  CHAT_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(25),
  // Longer than the material TTL: an image sits rendered in a scrollback
  // the reader may leave open, and a 2-minute URL would break on scroll-up.
  CHAT_ATTACHMENT_URL_TTL: z.coerce.number().int().positive().default(3600),

  VIDEO_TOKEN_SECRET: z.string().min(16, 'VIDEO_TOKEN_SECRET must be at least 16 characters'),
  VIDEO_PLAYBACK_TOKEN_TTL: z.coerce.number().int().positive().default(180),

  // Optional — the AI chat feature (Phase 13) degrades to a clear 503 at
  // request time rather than failing boot when this isn't configured.
  ANTHROPIC_API_KEY: z.string().optional().default(''),
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

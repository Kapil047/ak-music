import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),
  
  // 🔐 Crypto
  CRYPTO_SECRET_KEY: z.string().min(64, 'Must be a 64-hex char (32-byte) key').default('5f549ff4ff369e2f7ac5a056f59608c747aa09024a2930ebd702754de1ac12b8'),
  CRYPTO_ALGORITHM: z.string().default('aes-256-gcm'),
  CRYPTO_IV_LENGTH: z.string().default('16').transform((val) => parseInt(val, 10)),
  ENABLE_API_ENCRYPTION: z.string().default('true').transform((val) => val === 'true'),
  
  // 🔑 Auth
  API_SECRET_KEY: z.string().min(8, 'API secret key must be at least 8 chars').default('ak_music_super_secret_key_2026'),
  
  // ⏱️ Rate Limiter
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform((val) => parseInt(val, 10)),
  RATE_LIMIT_MAX: z.string().default('100').transform((val) => parseInt(val, 10)),
  
  // 🧠 Cache TTLs
  CACHE_TTL_SUGGESTIONS: z.string().default('600').transform((val) => parseInt(val, 10)),
  CACHE_TTL_SEARCH: z.string().default('300').transform((val) => parseInt(val, 10)),
  CACHE_TTL_STREAM: z.string().default('19800').transform((val) => parseInt(val, 10)),
  CACHE_TTL_EXPLORE: z.string().default('1800').transform((val) => parseInt(val, 10)),
  CACHE_TTL_METADATA: z.string().default('86400').transform((val) => parseInt(val, 10)),
  
  // 🎬 Downloads
  MAX_CONCURRENT_DOWNLOADS: z.string().default('3').transform((val) => parseInt(val, 10)),
  DOWNLOAD_TEMP_DIR: z.string().default('./temp/downloads')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

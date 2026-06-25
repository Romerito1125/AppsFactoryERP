import 'dotenv/config';
import * as Joi from 'joi';

interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET?: string;
  JWT_EXPIRES_IN?: string;
  CLOUDFLARE_R2_ACCOUNT_ID?: string;
  CLOUDFLARE_R2_ACCESS_KEY_ID?: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_R2_BUCKET?: string;
  CLOUDFLARE_R2_PUBLIC_URL?: string;
}

const envSchema = Joi.object<EnvVars>({
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().required(),

  JWT_SECRET: Joi.string().default('dev-jwt-secret-change-me'),
  JWT_EXPIRES_IN: Joi.string().default('1d'),

  CLOUDFLARE_R2_ACCOUNT_ID: Joi.string().allow('').optional(),
  CLOUDFLARE_R2_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  CLOUDFLARE_R2_BUCKET: Joi.string().allow('').optional(),
  CLOUDFLARE_R2_PUBLIC_URL: Joi.string().uri().allow('').optional(),
})
  .unknown(true)
  .required();

const { error, value } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const envVars = value;
const cloudflareR2 = {
  accountId: envVars.CLOUDFLARE_R2_ACCOUNT_ID || null,
  accessKeyId: envVars.CLOUDFLARE_R2_ACCESS_KEY_ID || null,
  secretAccessKey: envVars.CLOUDFLARE_R2_SECRET_ACCESS_KEY || null,
  bucket: envVars.CLOUDFLARE_R2_BUCKET || null,
  publicUrl: envVars.CLOUDFLARE_R2_PUBLIC_URL
    ? envVars.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, '')
    : null,
};

export const envs = {
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
  },
  cloudflareR2: {
    ...cloudflareR2,
    enabled: Boolean(
      cloudflareR2.accountId &&
        cloudflareR2.accessKeyId &&
        cloudflareR2.secretAccessKey &&
        cloudflareR2.bucket &&
        cloudflareR2.publicUrl,
    ),
  },
};

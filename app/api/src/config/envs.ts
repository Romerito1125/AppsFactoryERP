import 'dotenv/config';
import * as Joi from 'joi';

interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  CLOUDFLARE_R2_ACCOUNT_ID: string;
  CLOUDFLARE_R2_ACCESS_KEY_ID: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: string;
  CLOUDFLARE_R2_BUCKET: string;
  CLOUDFLARE_R2_PUBLIC_URL: string;
}

const envSchema = Joi.object<EnvVars>({
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().required(),

  CLOUDFLARE_R2_ACCOUNT_ID: Joi.string().required(),
  CLOUDFLARE_R2_ACCESS_KEY_ID: Joi.string().required(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: Joi.string().required(),
  CLOUDFLARE_R2_BUCKET: Joi.string().required(),
  CLOUDFLARE_R2_PUBLIC_URL: Joi.string().uri().required(),
})
  .unknown(true)
  .required();

const { error, value } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const envVars = value;

export const envs = {
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  cloudflareR2: {
    accountId: envVars.CLOUDFLARE_R2_ACCOUNT_ID,
    accessKeyId: envVars.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: envVars.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    bucket: envVars.CLOUDFLARE_R2_BUCKET,
    publicUrl: envVars.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, ''),
  },
};

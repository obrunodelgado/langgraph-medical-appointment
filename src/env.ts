import { z } from 'zod';

const baseUrlSchema = z.string().url().refine(
  value => /^https?:\/\//i.test(value),
  'A URL deve usar HTTP ou HTTPS',
);

export const envSchema = z.object({
  LM_STUDIO_API_KEY: z.string().min(1),
  LM_STUDIO_MODEL: z.string().trim().min(1),
  LM_STUDIO_BASE_URL: baseUrlSchema,
  WINNOW_BASE_URL: baseUrlSchema,
  WINNOW_API_KEY: z.string(),
  WINNOW_MODEL: z.string().trim().min(1),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

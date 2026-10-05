import { env } from './env.ts';

export type ModelConfig = {
  apiKey: string;
  model: string;
  baseURL: string;
  temperature: number;
};

export const config: ModelConfig = {
  apiKey: env.LM_STUDIO_API_KEY,
  model: env.LM_STUDIO_MODEL,
  baseURL: env.LM_STUDIO_BASE_URL,
  temperature: 0.7,
};

export const winnowConfig = {
  baseURL: env.WINNOW_BASE_URL,
  apiKey: env.WINNOW_API_KEY,
  model: env.WINNOW_MODEL,
};

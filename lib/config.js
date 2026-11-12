import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');

export const PORT = Number(process.env.PORT || 3000);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PROD = NODE_ENV === 'production';

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const APP_PASSWORD = process.env.APP_PASSWORD || '';
export const APP_PASSWORD_HASH = process.env.APP_PASSWORD_HASH || '';
export const SESSION_SECRET = process.env.SESSION_SECRET || 'celma-dev-secret-change-me';

export const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';

export const BRANDS = ['Personal Brand', 'MyJournal+', 'StudeCo', 'Custom'];
export const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'X'];
export const OBJECTIVES = ['Awareness', 'Engagement', 'Website visits', 'Sign-ups', 'Education', 'Authority', 'Community'];
export const CONTENT_TYPES = ['post', 'carousel', 'reel-script', 'video-script', 'story', 'thread', 'image-prompt'];

export const DEFAULT_AGENT_CONFIG = {
  mode: process.env.AGENT_MODE || 'semi-auto', // 'manual' | 'semi-auto' | 'auto'
  approvalRequired: process.env.APPROVAL_REQUIRED !== 'false',
  postingFrequency: process.env.DEFAULT_POSTING_FREQUENCY || 'daily', // hourly | daily | 3x-week | weekly | custom
  customCron: null,
  platformsEnabled: ['Facebook', 'TikTok', 'YouTube'],
  generalInstructions: 'You are an expert personal-brand growth agent. Prioritise authenticity, value, and platform-native formats. Never invent metrics, testimonials or medical claims.',
  actionInstructions: {
    createPost: 'Write concise, high-hook content. Include a soft CTA when appropriate.',
    createImagePrompt: 'Describe a clean, professional visual that matches the brand tone.',
    createVideoScript: 'Structure with strong hook (first 3s), value body, and clear ending CTA.',
    analyseGrowth: 'Be data-driven and give 3 concrete next actions.',
    learnFromOthers: 'Extract patterns that increase views and meaningful interaction. Avoid copying.'
  },
  learningSources: [],
  lastRunAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw Object.assign(new Error(`Missing required environment variable: ${name}`), { status: 503, code: 'MISSING_ENV' });
  return v;
}
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FUNCTION_TARGET);
export const DATA_DIR = process.env.DATA_DIR
  || (isServerless ? path.join('/tmp', 'celma-data') : path.join(ROOT, 'data'));

import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL } from '../lib/config.js';

let client = null;

function getClient() {
  if (!GEMINI_API_KEY) {
    const err = new Error('Gemini API key is not configured. Set GEMINI_API_KEY in .env');
    err.status = 503;
    err.code = 'GEMINI_NOT_CONFIGURED';
    throw err;
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return client;
}

/**
 * Core generation helper with robust error diagnosis
 */
export async function generateText({ system, prompt, temperature = 0.75, maxOutputTokens = 2048 }) {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: system || undefined,
        temperature,
        maxOutputTokens
      }
    });
    const text = response?.text || response?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!text.trim()) {
      const err = new Error('Gemini returned an empty response. Check model name and quota.');
      err.status = 502;
      err.code = 'EMPTY_GEMINI_RESPONSE';
      throw err;
    }
    return text.trim();
  } catch (err) {
    // Enrich common errors for diagnosis
    if (err.code) throw err;
    const msg = String(err.message || err);
    if (/API_KEY|api key|invalid.*key/i.test(msg)) {
      err.status = 401;
      err.code = 'INVALID_GEMINI_KEY';
    } else if (/quota|rate.?limit|429/i.test(msg)) {
      err.status = 429;
      err.code = 'GEMINI_QUOTA';
    } else if (/model|not found|404/i.test(msg)) {
      err.status = 400;
      err.code = 'BAD_GEMINI_MODEL';
    } else {
      err.status = 502;
      err.code = 'GEMINI_ERROR';
    }
    throw err;
  }
}

export function isGeminiConfigured() {
  return Boolean(GEMINI_API_KEY);
}

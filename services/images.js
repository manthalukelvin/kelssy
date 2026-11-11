/**
 * Gemini image generation for image-prompt content types
 */
import { GoogleGenAI } from '@google/genai';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { GEMINI_API_KEY, GEMINI_MODEL, DATA_DIR } from '../lib/config.js';
import { UPLOADS_DIR, ensureUploadsDir } from './uploads.js';

/**
 * Generate an image from a text prompt using Gemini image models.
 * Falls back gracefully if the model does not support image output.
 */
export async function generateImageFromPrompt(prompt, { postId } = {}) {
  if (!GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY not configured');
    err.status = 503;
    err.code = 'GEMINI_NOT_CONFIGURED';
    throw err;
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  // Prefer an image-capable model if available; otherwise use text model note
  const imageModels = [
    process.env.GEMINI_IMAGE_MODEL,
    'gemini-2.0-flash-preview-image-generation',
    'gemini-2.5-flash-image-preview',
    GEMINI_MODEL
  ].filter(Boolean);

  let lastError = null;
  for (const model of imageModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `Create a professional social-media image based on this description. Return only the image.\n\n${prompt}`,
        config: {
          // Some models accept responseModalities
          responseModalities: ['TEXT', 'IMAGE']
        }
      });

      // Extract inline image data if present
      const parts = response?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        const inline = part.inlineData || part.inline_data;
        if (inline?.data) {
          const mime = inline.mimeType || inline.mime_type || 'image/png';
          const ext = mime.includes('jpeg') || mime.includes('jpg') ? '.jpg' : '.png';
          await ensureUploadsDir();
          const filename = `${randomUUID()}${ext}`;
          const filePath = path.join(UPLOADS_DIR, filename);
          await writeFile(filePath, Buffer.from(inline.data, 'base64'), { mode: 0o600 });
          return {
            ok: true,
            model,
            path: filePath,
            relativeUrl: `/uploads/${filename}`,
            mime,
            postId: postId || null
          };
        }
      }

      // If only text came back, treat as failure for this model
      const text = response?.text || parts.map(p => p.text).filter(Boolean).join('');
      if (text) {
        lastError = new Error(`Model ${model} returned text instead of image. Try GEMINI_IMAGE_MODEL with an image-capable model.`);
        lastError.code = 'NO_IMAGE_IN_RESPONSE';
        continue;
      }
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  const err = lastError || new Error('Image generation failed with all configured models');
  err.status = 502;
  err.code = err.code || 'IMAGE_GEN_FAILED';
  throw err;
}

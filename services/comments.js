/**
 * AI comment / reply suggestions for personal brand engagement
 */
import { generateText } from './gemini.js';
import { getAgentConfig } from './agent.js';

/**
 * Suggest replies to a comment or post thread.
 */
export async function suggestReplies({
  originalPost = '',
  comment = '',
  tone = 'friendly, helpful, authentic',
  count = 3,
  platform = 'Instagram'
}) {
  if (!comment || comment.trim().length < 2) {
    const err = new Error('Provide the comment text to reply to');
    err.status = 400;
    err.code = 'COMMENT_REQUIRED';
    throw err;
  }

  const config = await getAgentConfig();
  const system = `${config.generalInstructions || 'You help a personal brand engage authentically.'}

You write short, natural reply suggestions. Never invent facts, never be salesy unless asked, never claim medical advice.`;

  const prompt = `Platform: ${platform}
Original post (context): ${originalPost.slice(0, 800) || '(not provided)'}
Incoming comment: ${comment.slice(0, 1000)}
Tone: ${tone}

Write exactly ${Math.min(Math.max(count, 1), 5)} distinct reply options.
Rules:
- Each reply under 220 characters when possible
- Sound human, not corporate
- Match the platform culture
- Number them 1) 2) 3)...
Return only the numbered replies.`;

  const text = await generateText({ system, prompt, temperature: 0.85, maxOutputTokens: 800 });
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const replies = lines
    .map(l => l.replace(/^\d+[.)]\s*/, '').trim())
    .filter(l => l.length > 0)
    .slice(0, 5);

  return { replies: replies.length ? replies : [text], raw: text };
}

import { v4 as uuidv4 } from 'uuid';
import { generateText } from './gemini.js';
import { readAgentConfig, writeAgentConfig, readPosts, writePosts, appendActivity, readGrowth, writeGrowth } from '../lib/storage.js';
import { DEFAULT_AGENT_CONFIG, BRANDS, PLATFORMS, OBJECTIVES, CONTENT_TYPES } from '../lib/config.js';

export async function getAgentConfig() {
  return readAgentConfig(DEFAULT_AGENT_CONFIG);
}

export async function updateAgentConfig(partial) {
  const current = await getAgentConfig();
  const next = {
    ...current,
    ...partial,
    actionInstructions: {
      ...current.actionInstructions,
      ...(partial.actionInstructions || {})
    },
    updatedAt: new Date().toISOString()
  };
  await writeAgentConfig(next);
  await appendActivity({ type: 'config_update', summary: 'Agent configuration updated', data: { keys: Object.keys(partial) } });
  return next;
}

/**
 * Build a rich system prompt from current agent instructions
 */
function buildSystemPrompt(config, action = 'createPost') {
  const actionInstr = config.actionInstructions?.[action] || config.actionInstructions?.createPost || '';
  return `${config.generalInstructions}

Current agent mode: ${config.mode}
Approval required before publishing: ${config.approvalRequired ? 'YES' : 'NO'}
Preferred platforms: ${(config.platformsEnabled || []).join(', ')}

Specific instruction for this action (${action}):
${actionInstr}

Rules:
- Stay authentic to a personal brand voice.
- Never invent statistics, user counts, testimonials, prices or medical claims.
- Prefer platform-native formats and strong hooks.
- When asked for image prompts, output only the visual description.
- When asked for video scripts, use clear structure: HOOK / BODY / CTA.
- Output clean markdown when helpful.`;
}

/**
 * Generate content of any supported type
 */
export async function generateContent({ brand, platform, objective, topic, tone, contentType = 'post', audience, extra }) {
  const config = await getAgentConfig();
  const system = buildSystemPrompt(config, contentType === 'image-prompt' ? 'createImagePrompt' : contentType.includes('video') || contentType.includes('reel') ? 'createVideoScript' : 'createPost');

  const prompt = `Create original ${contentType} content.

Brand / Persona: ${brand || 'Personal Brand'}
Platform: ${platform}
Objective: ${objective}
Audience: ${audience || 'general interested followers'}
Tone: ${tone || 'authentic, clear, valuable'}
Topic / Brief: ${topic}
${extra ? `Extra context: ${extra}` : ''}

Return only the final content ready for review. If contentType is image-prompt, return only the image generation prompt. If it is a script, return a structured script.`;

  const text = await generateText({ system, prompt, temperature: 0.8 });

  const post = {
    id: uuidv4(),
    brand: brand || 'Personal Brand',
    platform,
    objective,
    contentType,
    topic,
    tone,
    content: text,
    status: config.approvalRequired ? 'pending_approval' : 'approved',
    metrics: null,
    source: 'agent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const posts = await readPosts();
  posts.unshift(post);
  await writePosts(posts);

  await appendActivity({
    type: 'content_generated',
    summary: `Generated ${contentType} for ${platform}`,
    data: { postId: post.id, platform, contentType }
  });

  return post;
}

/**
 * Analyse growth and produce actionable suggestions
 */
export async function analyseGrowth(brand = '') {
  const config = await getAgentConfig();
  const posts = await readPosts();
  const filtered = brand ? posts.filter(p => p.brand === brand) : posts;
  const withMetrics = filtered.filter(p => p.metrics);

  const summary = {
    totalPosts: filtered.length,
    approved: filtered.filter(p => p.status === 'approved').length,
    pending: filtered.filter(p => p.status === 'pending_approval').length,
    tracked: withMetrics.length,
    totals: withMetrics.reduce((acc, p) => {
      const m = p.metrics || {};
      for (const k of ['reach', 'views', 'likes', 'comments', 'shares', 'clicks']) {
        acc[k] = (acc[k] || 0) + Number(m[k] || 0);
      }
      return acc;
    }, {})
  };

  const system = buildSystemPrompt(config, 'analyseGrowth');
  const prompt = `Here is the current performance snapshot for the brand:

${JSON.stringify(summary, null, 2)}

Recent posts (content + metrics if any):
${JSON.stringify(filtered.slice(0, 12).map(p => ({
  platform: p.platform,
  status: p.status,
  contentPreview: (p.content || '').slice(0, 180),
  metrics: p.metrics
})), null, 2)}

Provide:
1. Honest diagnosis of what is working and what is not
2. 5 concrete, prioritised suggestions to increase views and meaningful interaction
3. Recommended posting frequency and content mix for the next 7 days
Keep the answer practical and concise.`;

  const insights = await generateText({ system, prompt, temperature: 0.55, maxOutputTokens: 1500 });

  const growth = await readGrowth();
  growth.suggestions.unshift({
    id: uuidv4(),
    at: new Date().toISOString(),
    brand: brand || 'All',
    insights,
    snapshot: summary
  });
  growth.suggestions = growth.suggestions.slice(0, 30);
  await writeGrowth(growth);

  await appendActivity({ type: 'growth_analysis', summary: 'Ran growth analysis + suggestions' });

  return { summary, insights, suggestions: growth.suggestions };
}

/**
 * Learn from other public posts / competitors (user supplies text or description)
 * We do NOT scrape automatically to stay safe and compliant.
 */
export async function learnFromPosts({ postsText, goal = 'increase views and meaningful interaction' }) {
  const config = await getAgentConfig();
  const system = buildSystemPrompt(config, 'learnFromOthers');

  const prompt = `Analyse the following posts / content from other accounts (supplied by the user). Extract patterns that help ${goal}.

Supplied content:
---
${postsText.slice(0, 12000)}
---

Return:
- Key patterns that drive views / interaction
- What to steal (ethically) for our personal brand
- What to avoid
- 3–5 concrete content ideas we can produce next`;

  const analysis = await generateText({ system, prompt, temperature: 0.6 });

  // Persist learning source reference
  const nextConfig = await getAgentConfig();
  nextConfig.learningSources = nextConfig.learningSources || [];
  nextConfig.learningSources.unshift({
    id: uuidv4(),
    at: new Date().toISOString(),
    preview: postsText.slice(0, 200),
    analysisPreview: analysis.slice(0, 300)
  });
  nextConfig.learningSources = nextConfig.learningSources.slice(0, 20);
  await writeAgentConfig(nextConfig);

  await appendActivity({ type: 'learning', summary: 'Analysed external posts for growth patterns' });

  return { analysis };
}

/**
 * Create a weekly content plan
 */
export async function createWeeklyPlan({ brand, focus, platforms }) {
  const config = await getAgentConfig();
  const system = buildSystemPrompt(config, 'createPost');

  const prompt = `Create a practical 7-day content plan for a personal brand.

Brand: ${brand || 'Personal Brand'}
Focus / theme this week: ${focus || 'value + authority'}
Platforms: ${(platforms || config.platformsEnabled || ['TikTok', 'YouTube', 'Facebook']).join(', ')}
Posting frequency preference: ${config.postingFrequency}

For each day give:
- Day name
- Platform
- Content type
- Topic / hook idea
- Goal

Keep it realistic for a solo creator.`;

  const planText = await generateText({ system, prompt, temperature: 0.7 });

  const plan = {
    id: uuidv4(),
    brand: brand || 'Personal Brand',
    focus,
    plan: planText,
    createdAt: new Date().toISOString()
  };

  // We keep plans in the same file as original
  const { readPlans, writePlans } = await import('../lib/storage.js');
  const plans = await readPlans();
  plans.unshift(plan);
  await writePlans(plans.slice(0, 20));

  await appendActivity({ type: 'weekly_plan', summary: 'Generated weekly content plan' });
  return plan;
}

/**
 * Simple automation tick – decides whether new content should be generated
 * according to frequency settings. Called by cron or manual "run agent now".
 */
export async function runAgentTick({ force = false } = {}) {
  const config = await getAgentConfig();
  const now = Date.now();
  const last = config.lastRunAt ? new Date(config.lastRunAt).getTime() : 0;

  const intervals = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    '3x-week': (24 * 60 * 60 * 1000 * 7) / 3,
    weekly: 7 * 24 * 60 * 60 * 1000
  };
  const interval = intervals[config.postingFrequency] || intervals.daily;

  if (!force && last && (now - last) < interval * 0.85) {
    return { ran: false, reason: 'Too soon according to frequency settings', nextSuggested: new Date(last + interval).toISOString() };
  }

  // Generate one piece of content based on recent learning or default topic
  const platforms = config.platformsEnabled?.length ? config.platformsEnabled : ['TikTok'];
  const platform = platforms[Math.floor(Math.random() * platforms.length)];

  const post = await generateContent({
    brand: 'Personal Brand',
    platform,
    objective: 'Engagement',
    topic: 'Share one high-value insight or story that helps the audience today. Keep it authentic.',
    contentType: platform === 'YouTube' ? 'video-script' : platform === 'TikTok' ? 'reel-script' : 'post'
  });

  config.lastRunAt = new Date().toISOString();
  await writeAgentConfig(config);

  await appendActivity({
    type: 'agent_tick',
    summary: `Agent tick created ${post.contentType} for ${platform}`,
    data: { postId: post.id }
  });

  return { ran: true, post };
}

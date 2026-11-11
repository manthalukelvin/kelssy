#!/usr/bin/env node
import 'dotenv/config';
import { isGeminiConfigured } from '../services/gemini.js';

console.log('\nCelma AI Agent — Diagnostics\n' + '='.repeat(40));

const checks = [];

function add(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}`);
}

add('Node.js', process.versions.node.startsWith('20') || Number(process.versions.node.split('.')[0]) >= 20, process.version);
add('GEMINI_API_KEY', isGeminiConfigured(), isGeminiConfigured() ? 'Set' : 'Missing — get one at https://aistudio.google.com/apikey');
add('APP_PASSWORD / HASH', Boolean(process.env.APP_PASSWORD || process.env.APP_PASSWORD_HASH), process.env.APP_PASSWORD_HASH ? 'bcrypt hash present' : (process.env.APP_PASSWORD ? 'Plain password present' : 'Not set'));
add('SESSION_SECRET', Boolean(process.env.SESSION_SECRET) && process.env.SESSION_SECRET.length >= 16, process.env.SESSION_SECRET ? `length ${process.env.SESSION_SECRET.length}` : 'Missing or short');
add('TOKEN_ENCRYPTION_KEY', /^[a-f0-9]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY || ''), process.env.TOKEN_ENCRYPTION_KEY ? (process.env.TOKEN_ENCRYPTION_KEY.length === 64 ? 'Valid format' : 'Wrong length') : 'Not set');

const failed = checks.filter(c => !c.ok);
console.log('\n' + (failed.length ? `${failed.length} issue(s) found. Fix them before deploying.` : 'All basic checks passed.'));
console.log('');
process.exit(failed.length ? 1 : 0);

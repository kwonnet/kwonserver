import { createHash } from 'crypto';
export interface GeneratedQuestion { question: string; answer: string; options: string[] }
export const normalizeQuestion = (text: string) => text.normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, '').trim().replace(/\s+/g, ' ');
export const questionHash = (text: string) => createHash('sha256').update(normalizeQuestion(text)).digest('hex');
export function validateQuestion(input: unknown): GeneratedQuestion | null {
  if (!input || typeof input !== 'object') return null;
  const q = input as Record<string, unknown>;
  if (typeof q.question !== 'string' || typeof q.answer !== 'string' || !Array.isArray(q.options) || q.options.length !== 4) return null;
  if (!normalizeQuestion(q.question) || !normalizeQuestion(q.answer) || q.question.length > 2000) return null;
  if (!q.options.every(o => typeof o === 'string' && normalizeQuestion(o) && o.length <= 500)) return null;
  const options = (q.options as string[]).map(o => o.trim());
  const normalized = options.map(normalizeQuestion);
  if (new Set(normalized).size !== 4) return null;
  const index = normalized.indexOf(normalizeQuestion(q.answer));
  if (index < 0) return null;
  return { question: q.question.trim(), answer: options[index], options };
}
export function validateBatch(batch: unknown[]) {
  const seen = new Set<string>();
  let invalidCount = 0, duplicateCount = 0;
  const valid: (GeneratedQuestion & { normalizedHash: string })[] = [];
  for (const input of batch) {
    const question = validateQuestion(input);
    if (!question) { invalidCount++; continue; }
    const normalizedHash = questionHash(question.question);
    if (seen.has(normalizedHash)) { duplicateCount++; continue; }
    seen.add(normalizedHash);
    valid.push({ ...question, normalizedHash });
  }
  return { valid, invalidCount, duplicateCount };
}

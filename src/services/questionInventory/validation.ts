import { createHash } from 'crypto';
import { englishDictionary, normalizeSentence, sentenceWords, wordBag, SentenceGame } from '@/utils/word-games';
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
export function validateSentenceQuestion(input: unknown, kind: SentenceGame): GeneratedQuestion | null {
  if (!input || typeof input !== 'object') return null;
  const q = input as Record<string, unknown>;
  if (typeof q.question !== 'string' || typeof q.answer !== 'string' || !Array.isArray(q.options)) return null;
  const words = sentenceWords(q.question);
  if (q.question.length > 90 || words.length < 5 || words.length > (kind === 'UNSCRAMBLE' ? 10 : 12) || new Set(words).size < 3) return null;
  // Use simple dictionary English so punctuation cannot change token boundaries.
  if (!/^[A-Za-z ,.!?;:\s]+$/.test(q.question) || !words.every(word => englishDictionary().has(word) || word === 'a' || word === 'i')) return null;
  if (normalizeSentence(q.answer) !== normalizeSentence(q.question)) return null;
  if (kind === 'TYPEMANIA') return q.options.length === 0 ? {question:q.question.trim(),answer:q.question.trim(),options:[]} : null;
  if (q.options.length < 1 || q.options.length > 6 || !q.options.every(option => typeof option === 'string' && option.length <= 90 && /^[A-Za-z ,.!?;:\s]+$/.test(option) && wordBag(option) === wordBag(q.question as string))) return null;
  const options = [...new Map((q.options as string[]).map(option => [normalizeSentence(option), option.trim()])).values()];
  if (!options.some(option => normalizeSentence(option) === normalizeSentence(q.answer as string))) return null;
  return {question:q.question.trim(),answer:q.question.trim(),options};
}
export function validateBatch(batch: unknown[], sentenceKind?: SentenceGame) {
  const seen = new Set<string>();
  let invalidCount = 0, duplicateCount = 0;
  const valid: (GeneratedQuestion & { normalizedHash: string })[] = [];
  for (const input of batch) {
    const question = sentenceKind ? validateSentenceQuestion(input, sentenceKind) : validateQuestion(input);
    if (!question) { invalidCount++; continue; }
    const normalizedHash = questionHash(sentenceKind === 'UNSCRAMBLE' ? wordBag(question.question) : question.question);
    if (seen.has(normalizedHash)) { duplicateCount++; continue; }
    seen.add(normalizedHash);
    valid.push({ ...question, normalizedHash });
  }
  return { valid, invalidCount, duplicateCount };
}

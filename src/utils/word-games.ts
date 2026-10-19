import wordlist from 'wordlist-english';
import { GameCatType, ThemedGameQuestion } from '@/types';

export const MAX_SENTENCE_WORDS = 7;
export const sentenceHint = (sentence: string) => `${sentence.trim().split(/\s+/).slice(0, 3).join(' ').replace(/[.,!?;:]/g, '')} …`;

export type SentenceGame = 'TYPEMANIA' | 'UNSCRAMBLE';
export function sentenceGame(name: string): SentenceGame | undefined {
  const key = name.toLowerCase().replace(/[^a-z]/g, '');
  if (key.includes('typemania') || key.includes('typingmania')) return 'TYPEMANIA';
  if (key.includes('unscramble')) return 'UNSCRAMBLE';
}
export const normalizeSentence = (text: string) => text.normalize('NFKC').toLowerCase()
  .replace(/[’‘]/g, "'").replace(/[.,!?;:]/g, '').trim().replace(/\s+/g, ' ');
export const sentenceWords = (text: string) => normalizeSentence(text).split(' ');
export const wordBag = (text: string) => sentenceWords(text).sort().join(' ');
let dictionary: Set<string> | undefined;
export function englishDictionary() {
  return dictionary ??= new Set((wordlist.english as string[]).filter(word => /^[a-z]+$/.test(word)));
}
export function canFormWord(base: string, word: string) {
  const letters = base.toLowerCase().replace(/[^a-z]/g, '').split('');
  for (const letter of word) {
    const index = letters.indexOf(letter);
    if (index < 0) return false;
    letters.splice(index, 1);
  }
  return true;
}

// Only the server keeps answer variants. Sentence and Hangman puzzles do not
// need an answer key in their socket payload.
export function publicWordQuestion(question: ThemedGameQuestion): ThemedGameQuestion {
  return {id: question.id, roundId: question.roundId, question: question.question,
    options: question.options, type: question.type, answer: '', hint: question.hint,
    answerUntil: question.answerUntil, voteUntil: question.voteUntil};
}
export function matchesSentenceAnswer(question: ThemedGameQuestion, answer: string, category: GameCatType | undefined) {
  if (category !== GameCatType.TYPEMANIA && category !== GameCatType.UNSCRAMBLE) {
    return answer.toLowerCase() === question.answer.toLowerCase();
  }
  const normalized = normalizeSentence(answer);
  const accepted = question.acceptedAnswers ?? [question.answer];
  return accepted.some(option => normalizeSentence(option) === normalized) &&
    (category !== GameCatType.UNSCRAMBLE || wordBag(answer) === wordBag(question.answer));
}

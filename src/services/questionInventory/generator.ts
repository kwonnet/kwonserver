export interface GenerationInput {
  categoryId: string;
  categoryName: string;
  context?: string;
  topics: string[];
  count: number;
}
export interface QuestionGenerator {
  generateBatch(input: GenerationInput): Promise<unknown[]>;
}
// Reuses the existing structured-output provider adapter; no provider in inventory/worker.
export const questionGenerator: QuestionGenerator = {
  async generateBatch(input) {
    const { generateTriviaBatch, generateSentenceBatch } = await import('@/utils/ai');
    const { sentenceGame } = await import('@/utils/word-games');
    const kind = sentenceGame(input.categoryName);
    return kind ? generateSentenceBatch(input, kind) : generateTriviaBatch(input);
  },
};

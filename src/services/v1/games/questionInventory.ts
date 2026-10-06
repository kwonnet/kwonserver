import type { TempGameRoom, ThemedGameQuestion } from '@/types';
import { GameType } from '@/types';
import { InventoryExhaustedError, QuestionInventoryService } from '@/services/questionInventory/service';
import logger from '@/logger';
export const questionHistoryKey = (roomId: string) => `room:${roomId}:question-history`;

// Room eligibility stays here, separate from the reusable global category bank.
export async function getInventoryRoomQuestion(inventory: QuestionInventoryService, room: TempGameRoom): Promise<ThemedGameQuestion> {
  const key = questionHistoryKey(room.roomId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const seen = await inventory.redis.smembers(key);
    try { await inventory.recordDemand(room.catId, room.roomId, seen.length); }
    catch (error) { logger.warn({event: 'game_service_error', operation: 'getInventoryRoomQuestion.recordDemand', roomId: room.roomId, categoryId: room.catId, err: error}, 'Quiz room demand metric unavailable'); }
    const candidates = await inventory.getCandidates(room.catId, seen);
    // Redis SADD is an atomic claim even when two API instances select together.
    while (candidates.length) {
      const index = Math.floor(Math.random() * candidates.length);
      const [question] = candidates.splice(index, 1);
      if (await inventory.redis.sadd(key, question.id)) {
        return { id: question.id, question: question.question, answer: question.answer,
          options: question.options, type: GameType.TRIVIA };
      }
    }
  }
  throw new InventoryExhaustedError(room.catId);
}

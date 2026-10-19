import { Prisma } from "@prisma/client";
import { PromisePool } from "@supercharge/promise-pool";
import prisma from "@/db";
import logger from "@/logger";
import { dispatchGameAction } from "@/services/walletLedger/gameDelivery";
import {
  RoundSnapshot,
  settleGameRound,
  recoverRoundProjections,
} from "./rounds";
import { TempGameRoom } from "@/types";

/** Durable accepted action payloads reconstruct a round after a complete Redis loss. */
export async function recoverGameRounds() {
  const rows = await prisma.gameRoundRecord.findMany({
    where: {
      status: "PENDING",
      playedAt: { lt: new Date(Date.now() - 120000) },
    },
    orderBy: { playedAt: "asc" },
    take: 100,
  });
  for (const row of rows) {
    try {
      const pending = await prisma.gameWalletAction.findMany({
        where: { roundId: row.id, status: "PENDING" },
        take: 500,
        select: { id: true },
      });
      const { errors } = await PromisePool.for(pending)
        .withConcurrency(8)
        .process(async (action) => {
          await dispatchGameAction(action.id);
        });
      if (
        errors.length ||
        (await prisma.gameWalletAction.count({
          where: { roundId: row.id, status: "PENDING" },
        }))
      )
        continue;
      let snapshot = row.snapshot as unknown as RoundSnapshot;
      if (!snapshot) {
        const answers = new Map<string, any>(),
          votes = new Map<string, string>();
        let cursor: bigint | undefined;
        for (;;) {
          const actions = await prisma.gameWalletAction.findMany({
            where: {
              roundId: row.id,
              status: "DELIVERED",
              ...(cursor ? { sequence: { gt: cursor } } : {}),
            },
            orderBy: { sequence: "asc" },
            take: 500,
          });
          if (!actions.length) break;
          for (const action of actions) {
            const p = action.payload as any;
            if (action.kind === "VOTE") {
              votes.set(action.userId, p.votedUserId);
              continue;
            }
            if (action.kind === "WORDMAKER") {
              const previous = answers.get(action.userId) ?? {
                ...p,
                answer: "",
                answers: [],
              };
              if (
                !previous.answers.some((entry: any) => entry.text === p.answer)
              )
                previous.answers.push({ timer: p.timer, text: p.answer });
              answers.set(action.userId, previous);
            } else if (["ANSWER", "ACRONYM"].includes(action.kind))
              answers.set(action.userId, { ...p, votes: [], voted: false });
          }
          cursor = actions.at(-1)!.sequence;
        }
        for (const [voter, target] of votes) {
          if (answers.has(target) && target !== voter)
            answers.get(target).votes.push(voter);
          if (answers.has(voter)) answers.get(voter).voted = true;
        }
        snapshot = {
          question: row.question as any,
          answers: [...answers.values()],
        };
        await prisma.gameRoundRecord.updateMany({
          where: { id: row.id, snapshot: { equals: Prisma.DbNull } },
          data: { snapshot: snapshot as unknown as Prisma.InputJsonValue },
        });
      }
      const { calculateGameRoomPoints } = await import("./index");
      const question = row.question as any;
      let room = question.context as TempGameRoom | undefined;
      if (!room) {
        const cat = await prisma.gameCategory.findUniqueOrThrow({
          where: { id: row.catId },
          include: { game: true },
        });
        room = {
          roomId: row.roomId,
          catId: row.catId,
          mode: row.mode,
          generation: row.generation,
          gameName: cat.game.name,
          catName: cat.name,
          gameId: cat.gameId,
        } as TempGameRoom;
      }
      await settleGameRound(row.id, (input) =>
        calculateGameRoomPoints(room!, input),
      );
    } catch (error) {
      logger.error(
        { event: "game_round_recovery_failed", roundId: row.id, error },
        "Durable round remains available for recovery",
      );
    }
  }
  await recoverRoundProjections();
}

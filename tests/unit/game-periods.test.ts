import { expect, it } from "vitest";
import {
  gamePeriod,
  rankingKeysAt,
  playerKeysAt,
  isoWeekStart,
  GAME_PERIOD_RETENTION_SECONDS,
} from "@/utils/game-periods";
import { publicWordQuestion } from "@/utils/word-games";
it("keeps one weekly key across calendar month and ISO year boundaries", () => {
  for (const dates of [
    ["2026-04-30", "2026-05-01"],
    ["2026-12-31", "2027-01-01"],
  ]) {
    const [a, b] = dates.map((date) =>
      rankingKeysAt("cat", "multi", new Date(date)),
    );
    expect(a.week).toBe(b.week);
    expect(a.month).not.toBe(b.month);
  }
  expect(gamePeriod(new Date("2027-01-01")).weekYear).toBe(2026);
  expect(isoWeekStart(2026, 53).toISOString()).toBe("2026-12-28T00:00:00.000Z");
});
it("uses matching player and ranking periods and retains closed periods beyond payout schedules", () => {
  const date = new Date("2026-10-31T23:59:59Z");
  expect(rankingKeysAt("cat", "single", date).month).toContain("month:2026-10");
  expect(playerKeysAt("u", "cat", "single", date).month).toContain(
    "month:2026-10",
  );
  expect(GAME_PERIOD_RETENTION_SECONDS).toBeGreaterThan(90 * 86400);
});
it.each(["TRIVIA", "MINDMASH", "COUNTRY", "SPORTS", "ACADEMIA"])(
  "never serializes answer keys for %s",
  (type) => {
    const question = {
      id: "q",
      question: "Question",
      answer: "SECRET",
      options: ["A", "B"],
      type,
      acceptedAnswers: ["PRIVATE"],
      hint: "hint",
      internalSecret: "DO NOT SEND",
    } as any;
    const publicQuestion = publicWordQuestion(question);
    expect(publicQuestion.answer).toBe("");
    expect(publicQuestion).not.toHaveProperty("acceptedAnswers");
    expect(publicQuestion).not.toHaveProperty("internalSecret");
    expect(publicQuestion.options).toEqual(["A", "B"]);
  },
);

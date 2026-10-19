/** All game periods use UTC; weekly identity uses the ISO week-year. */
export function isoGameWeek(date: Date) {
  const thursday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(
    ((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7,
  );
  return { year, week };
}
export function gamePeriod(date = new Date()) {
  const { year: weekYear, week } = isoGameWeek(date);
  const year = date.getUTCFullYear(),
    month = date.getUTCMonth() + 1,
    day = date.getUTCDate();
  return { year, month, day, week, weekYear };
}
export function gamePeriodSuffixes(date = new Date()) {
  const p = gamePeriod(date),
    pad = (n: number) => String(n).padStart(2, "0");
  return {
    month: `month:${p.year}-${pad(p.month)}`,
    week: `week:${p.weekYear}-W${pad(p.week)}`,
    today: `day:${p.year}-${pad(p.month)}-${pad(p.day)}`,
  };
}
// Expiry is a safety bound, never the month-end deadline. Settlement pins inputs.
export const GAME_PERIOD_RETENTION_SECONDS = 120 * 86400;
export function rankingKeysAt(
  catId: string,
  mode: "single" | "multi",
  date = new Date(),
) {
  const p = gamePeriodSuffixes(date),
    base = `ranking:v2:cat:${catId}:mode:${mode}`;
  return {
    month: `${base}:${p.month}`,
    week: `${base}:${p.week}`,
    today: `${base}:${p.today}`,
    monthStat: `${base}:${p.month}:stat`,
  };
}
export function playerKeysAt(
  playerId: string,
  catId: string,
  mode: "single" | "multi",
  date = new Date(),
) {
  const p = gamePeriodSuffixes(date),
    base = `player:v2:${playerId}:cat:${catId}:mode:${mode}`;
  return {
    energy: `player:${playerId}:cat:${catId}:energy`,
    info: `player:${playerId}:cat:${catId}:mode:${mode}:profile`,
    month: `${base}:${p.month}`,
    week: `${base}:${p.week}`,
    today: `${base}:${p.today}`,
  };
}
export function isoWeekStart(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  jan4.setUTCDate(
    jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (week - 1) * 7,
  );
  return jan4;
}

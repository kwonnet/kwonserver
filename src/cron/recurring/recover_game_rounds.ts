import { recoverGameRounds } from "@/services/v1/games/recovery";
export async function run() {
  await recoverGameRounds();
}

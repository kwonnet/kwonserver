import {recoverLiveGameResults} from '@/services/v1/games/liveResults';
import { recoverGameRounds } from "@/services/v1/games/recovery";
export async function run() {
  await recoverLiveGameResults();
  await recoverGameRounds();
}

import {syncGameEnergy} from "@/services/v1/games/energy";
export async function run() { await syncGameEnergy(10000); }

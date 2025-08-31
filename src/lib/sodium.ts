// src/lib/sodium.ts
import sodium from 'libsodium-wrappers-sumo';

let ready = false;
export async function initSodium() {
  if (!ready) { await sodium.ready; ready = true; }
  return sodium;
}
export default sodium;

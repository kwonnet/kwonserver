type GeoApi = typeof import('ip-location-api');
type LookupOutcome = 'not_requested' | 'matched' | 'no_match' | 'timeout' | 'lookup_failed';

// Initialization never blocks API startup or authentication indefinitely. A failed
// download can recover after cooldown instead of staying failed until restart.
export function createIpLookup(load: () => GeoApi, timeoutMs = 1500, retryMs = 60_000) {
  let ready: Promise<GeoApi | null> | undefined;
  let state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  let nextRetryAt = 0;
  let failures = 0;
  let lastInitializationError: string | null = null;
  let lastLookup: LookupOutcome = 'not_requested';
  const initialize = () => {
    if (ready && (state !== 'failed' || Date.now() < nextRetryAt)) return ready;
    state = 'loading';
    ready = Promise.resolve().then(async () => {
      const api = load();
      await api.reload();
      state = 'ready'; nextRetryAt = 0; lastInitializationError = null;
      console.info('IP geolocation database ready');
      return api;
    }).catch((error: unknown) => {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      lastInitializationError = ['EACCES', 'EPERM', 'ENOSPC', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(code) ? code : 'INITIALIZATION_FAILED';
      state = 'failed'; failures++;
      nextRetryAt = Date.now() + retryMs;
      console.warn('IP geolocation initialization failed; retry available after cooldown', {code: lastInitializationError});
      return null;
    });
    return ready;
  };
  const lookup = async (ip: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        initialize().then(async api => {
          if (!api) return null;
          const result = await api.lookup(ip);
          lastLookup = result ? 'matched' : 'no_match';
          return result;
        }),
        new Promise<null>(resolve => { timer = setTimeout(() => {lastLookup = 'timeout'; resolve(null);}, timeoutMs); }),
      ]);
    } catch {
      lastLookup = 'lookup_failed';
      return null;
    } finally {if (timer) clearTimeout(timer);}
  };
  return Object.assign(lookup, {
    warmup: initialize,
    status: () => ({state, failures, lastInitializationError, nextRetryAt: nextRetryAt ? new Date(nextRetryAt).toISOString() : null, lastLookup}),
  });
}
export const lookup = createIpLookup(() => {
  process.env.ILA_SKIP_INITIAL_RELOAD = 'true';
  // Defaults to useful approximate fields, excluding coordinates/postcodes.
  // An explicit deployment ILA_FIELDS setting still takes precedence.
  process.env.ILA_FIELDS ||= 'country,region1_name,city,timezone';
  return require('ip-location-api') as GeoApi;
});

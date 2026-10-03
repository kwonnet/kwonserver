type GeoApi = typeof import('ip-location-api');

// The CommonJS library otherwise runs a synchronous database download on import.
// Keep optional geolocation initialization off the API/worker startup path.
export function createIpLookup(load: () => GeoApi, timeoutMs = 1500) {
  let ready: Promise<GeoApi | null> | undefined;
  return async (ip: string) => {
    ready ??= Promise.resolve().then(async () => {
      const api = load();
      await api.reload(); // Async database creation, shared by concurrent requests.
      return api;
    }).catch(() => {
      console.warn('IP geolocation unavailable; continuing without location data.');
      return null;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        ready.then(api => api ? api.lookup(ip) : null),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
      ]);
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

export const lookup = createIpLookup(() => {
  process.env.ILA_SKIP_INITIAL_RELOAD = 'true';
  return require('ip-location-api') as GeoApi;
});

// Read-only diagnostics. Never print client addresses, usernames or credentials.
require('dotenv').config();
const Redis = require('ioredis');
const client = new Redis(process.env.REDIS_URL, {
  connectionName: 'kwonserver:diagnostics', maxRetriesPerRequest: 1,
  connectTimeout: 5000, commandTimeout: 5000,
});
client.on('error', () => {});
(async () => {
  try {
    const info = await client.info('clients');
    for (const line of info.split('\r\n')) {
      if (/^(connected_clients|maxclients|blocked_clients):/.test(line)) console.log(line);
    }
    // Some managed providers disallow CLIENT LIST; INFO can still be useful.
    try {
      const groups = {};
      for (const row of (await client.client('LIST')).trim().split('\n')) {
        const name = row.split(' ').find(field => field.startsWith('name='))?.slice(5);
        const group = name?.startsWith('kwonserver:') ? name : name?.startsWith('bull:') ? 'BullMQ blocking clients' : 'Other/unnamed clients';
        groups[group] = (groups[group] || 0) + 1;
      }
      console.log(JSON.stringify(groups, null, 2));
    } catch { console.log('CLIENT LIST unavailable; check the Redis provider dashboard.'); }
  } catch { console.error('Cannot inspect Redis; check access and provider permissions.'); process.exitCode = 1; }
  finally { client.disconnect(); }
})();

// Docker CLI env files do not use dotenv's quoting syntax.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '..');
const values = dotenv.parse(fs.readFileSync(path.join(root, '.env')));
const lines = Object.entries(values).map(([key, value]) => {
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`${key} cannot be represented in a Docker CLI env file (multiline or NUL value)`);
  }
  return `${key}=${value}`;
});
const output = path.join(root, '.env.docker');
fs.writeFileSync(output, lines.join('\n') + '\n', { mode: 0o600 });
fs.chmodSync(output, 0o600);
console.log('Created .env.docker for docker run --env-file (credentials are not printed).');

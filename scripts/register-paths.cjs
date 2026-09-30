const path = require('node:path');
require('tsconfig-paths').register({
  baseUrl: path.resolve(__dirname, '../dist'),
  paths: { '@/*': ['*'] },
  // Do not let bare package imports (e.g. redis) match local dist folders.
  addMatchAll: false,
});

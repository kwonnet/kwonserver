require('dotenv').config();
require('./register-paths.cjs');
const prisma = require('../dist/db').default;
const {cleanupAuthHistory} = require('../dist/services/v1/auth');
cleanupAuthHistory().then(result => console.log(JSON.stringify(result))).catch(() => {
  console.error('Authentication history cleanup failed'); process.exitCode = 1;
}).finally(() => prisma.$disconnect());

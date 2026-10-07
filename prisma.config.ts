import 'dotenv/config';
import {defineConfig} from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {path: 'prisma/migrations', seed: 'node dist-seed/seed.js'},
  datasource: {url: process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL || ''},
});

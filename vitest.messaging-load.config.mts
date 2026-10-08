import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
 test:{environment:'node',include:['tests/load/**/*.test.ts'],setupFiles:['tests/integration/setup.ts'],fileParallelism:false,maxWorkers:1,testTimeout:180000,hookTimeout:90000,restoreMocks:true,env:{NODE_ENV:'test',TZ:'UTC',MESSAGING_LOAD_TEST:'true'}},
});

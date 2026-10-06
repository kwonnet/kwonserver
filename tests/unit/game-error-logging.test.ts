import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({findMany:vi.fn(),get:vi.fn(),hGetAll:vi.fn()}));
vi.mock('@/db',()=>({default:{post:{},game:{findMany:deps.findMany}}}));
vi.mock('@/redis',()=>({default:{get:deps.get,hGetAll:deps.hGetAll}}));
vi.mock('@/utils/ai',()=>({generateRoomQuestion:vi.fn(),shuffleArray:vi.fn()}));
vi.mock('@/utils/webpush',()=>({default:{}}));
vi.mock('@/services/helper',()=>({}));
import logger from '@/logger';
import {getGames,getGameRoom} from '@/services/v1/games';
it('logs recoverable failures with operation, resource context and the original stack',async()=>{
 const err=new Error('Redis connection unavailable');deps.hGetAll.mockRejectedValue(err);
 expect(await getGameRoom('room-1')).toBeNull();expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({event:'game_service_error',operation:'getGameRoom',roomId:'room-1',err}),expect.any(String));
 deps.findMany.mockRejectedValue(Error('database unavailable'));expect((await getGames()).status).toBe(500);
 expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({operation:'getGames',err:expect.any(Error)}),expect.any(String));
});
it('does not leave silent catch blocks in game services',()=>{
 for(const file of ['index.ts','questionInventory.ts']){
  const tree=ts.createSourceFile(file,readFileSync(`src/services/v1/games/${file}`,'utf8'),ts.ScriptTarget.Latest,true);
  let catches=0;
  const walk=(node:ts.Node)=>{if(ts.isCatchClause(node)){catches++;expect(node.block.getText(tree)).toMatch(/logGameError\(|logger\.(error|warn)\(/);}ts.forEachChild(node,walk);};walk(tree);expect(catches).toBeGreaterThan(0);
 }
});

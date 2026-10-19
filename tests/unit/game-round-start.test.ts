import {beforeEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({now:100000,find:vi.fn(),update:vi.fn(),create:vi.fn(),record:vi.fn(),eval:vi.fn(),generation:vi.fn()}));
vi.mock('@/db',()=>({default:{gameRoomRuntime:{findUnique:deps.find},$transaction:async(fn:Function)=>fn({gameRoomRuntime:{updateMany:deps.update,createMany:deps.create},gameRoundRecord:{create:deps.record}})}}));
vi.mock('@/redis',()=>({default:{hGet:deps.generation,eval:deps.eval}}));
vi.mock('@/services/v1/games/clock',()=>({gameClock:async()=>deps.now}));
vi.mock('@/services/v1/games/lease',()=>({assertGameRuntimeLease:async()=>{},gameRuntimeLease:{}}));
vi.mock('@/services/v1/games/rounds',()=>({recoverRoundProjections:vi.fn()}));
import {beginGameRound} from '@/services/v1/games/runtime';
const room:any={roomId:'room',generation:'generation',catId:'cat',mode:'SINGLE',status:'CHAT'};
const question:any={id:'q',question:'Question',answer:'answer',options:['0','10'],type:'MINDMASH'};
beforeEach(()=>{
 vi.clearAllMocks();deps.now=100000;deps.generation.mockResolvedValue('generation');
 deps.find.mockImplementation(async()=>{deps.now+=4000;return {generation:'generation',revision:1};});
 deps.update.mockResolvedValue({count:1});deps.create.mockResolvedValue({count:1});deps.eval.mockResolvedValue(1);
});
it.each([10,15,20])('starts a %i-second round after slow preparation and publishes consistent private deadlines',async seconds=>{
 const started=await beginGameRound(room,question,seconds);
 expect(started).toMatchObject({startedAt:104000,answerUntil:104000+seconds*1000,voteUntil:116000+seconds*1000});
 expect(deps.record).toHaveBeenCalledOnce();
 expect(deps.record.mock.calls[0][0].data.question.answerUntil).toBe(started!.answerUntil);
 expect(deps.update.mock.calls[0][0].data.deadline.getTime()).toBe(started!.answerUntil);
 const script=deps.eval.mock.calls[0][1];
 expect(script.arguments[2]).toBe(String(seconds));
 expect(JSON.parse(script.arguments[4])).toEqual(started);
 expect(script.arguments[3]).toBe(String(started!.answerUntil));
});
it('does not publish a new question after a generation change',async()=>{
 deps.generation.mockResolvedValue('replacement');
 expect(await beginGameRound(room,question,10)).toBeUndefined();
 expect(deps.record).not.toHaveBeenCalled();expect(deps.eval).not.toHaveBeenCalled();
});
it('does not create or publish a round when another phase won the revision',async()=>{
 deps.update.mockResolvedValue({count:0});
 expect(await beginGameRound(room,question,10)).toBeUndefined();
 expect(deps.record).not.toHaveBeenCalled();expect(deps.eval).not.toHaveBeenCalled();
});

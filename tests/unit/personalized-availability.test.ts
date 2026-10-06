import {beforeEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({findMany:vi.fn(),recommend:vi.fn(),history:vi.fn(),multi:vi.fn(),zAdd:vi.fn(),trim:vi.fn(),expire:vi.fn(),exec:vi.fn(),get:vi.fn(),set:vi.fn(),eval:vi.fn(),redis:{isReady:true}}));
vi.mock('@/db',()=>({default:{post:{findMany:deps.findMany}}}));
vi.mock('@/redis',()=>({default:{get isReady(){return deps.redis.isReady;},zRange:deps.history,multi:deps.multi,get:deps.get,set:deps.set,eval:deps.eval}}));
vi.mock('@/services/kwonrec',async()=>({...await vi.importActual<typeof import('@/services/kwonrec')>('@/services/kwonrec'),getRecommendationResponse:deps.recommend}));
vi.mock('@/utils/webpush',()=>({default:{}}));
import {getAvailableNewsfeedSnapshot,rememberDeliveredRecommendations} from '@/services/v1/posts';
beforeEach(()=>{
 vi.resetAllMocks();deps.redis.isReady=true;deps.history.mockResolvedValue(['last']);
 const state=new Map<string,{value:string;expires:number}>();
 deps.get.mockImplementation(async key=>{const item=state.get(key);return item&&item.expires>Date.now()?item.value:null;});
 deps.set.mockImplementation(async(key,value,options)=>{const current=state.get(key);if(options.NX&&current&&current.expires>Date.now())return null;state.set(key,{value,expires:Date.now()+options.PX});return 'OK';});
 deps.eval.mockImplementation(async(_script,{keys,arguments:args})=>{if(await deps.get(keys[0])!==args[0])return 0;if(keys.length===2)state.set(keys[1],{value:args[1],expires:Date.now()+Number(args[2])});state.delete(keys[0]);return 1;});
 const chain={zAdd:deps.zAdd,zRemRangeByRank:deps.trim,expire:deps.expire,exec:deps.exec};
 deps.multi.mockReturnValue(chain);deps.zAdd.mockReturnValue(chain);deps.trim.mockReturnValue(chain);deps.expire.mockReturnValue(chain);deps.exec.mockResolvedValue([]);
});
it('offers only fresh personalized ranks after the viewer’s delivered baseline and preserves ranking',async()=>{
 deps.recommend.mockResolvedValue({data:{recommendations:[{id:'last'},{id:'b'},{id:'c'},{id:'hidden'}]}});
 deps.findMany.mockResolvedValue([{id:'c',user:{id:'c-author',name:'C',avatar:null}},{id:'b',user:{id:'b-author',name:'B',avatar:null}}]);
 const result=await getAvailableNewsfeedSnapshot('ada','foryou',new Date(),['client-last']);
 expect(deps.recommend).toHaveBeenCalledWith('ada',100,1);expect(deps.history).toHaveBeenCalledWith('feed:recommended:ada',-2000,-1);
 expect(result.ids).toEqual(['b','c']);expect(result.authors.map(author=>author.id)).toEqual(['b-author','c-author']);
 expect(deps.findMany.mock.calls[0][0].where).toMatchObject({id:{in:['b','c','hidden']},status:'PUBLISHED'});
 expect(deps.zAdd).not.toHaveBeenCalled();
});
it('keeps viewer histories separate and binds ranking to each viewer',async()=>{
 deps.history.mockImplementation(key=>Promise.resolve(key.endsWith('ada')?['a']:['b']));
 deps.recommend.mockImplementation(user=>Promise.resolve({data:{recommendations:user==='ada'?[{id:'a'},{id:'b'}]:[{id:'b'},{id:'c'}]}}));
 deps.findMany.mockImplementation(({where})=>Promise.resolve(where.id.in.map((id:string)=>({id,user:{id:'author',name:'Author',avatar:null}}))));
 expect((await getAvailableNewsfeedSnapshot('ada','foryou',new Date())).ids).toEqual(['b']);
 expect((await getAvailableNewsfeedSnapshot('ben','foryou',new Date())).ids).toEqual(['c']);
});
it('does not publish chronological fallback as personalized recommendations',async()=>{
 deps.recommend.mockResolvedValue({data:{degraded:true,recommendations:[{id:'generic'}]}});
 expect(await getAvailableNewsfeedSnapshot('ada','foryou',new Date())).toMatchObject({ids:[],degraded:true});expect(deps.findMany).not.toHaveBeenCalled();
});
it('skips optional notification inference when Redis coordination is unavailable',async()=>{
 deps.redis.isReady=false;deps.recommend.mockResolvedValue({data:{recommendations:[{id:'last'},{id:'fresh'}]}});
 deps.findMany.mockResolvedValue([{id:'fresh',user:{id:'author',name:'A',avatar:null}}]);
 expect(await getAvailableNewsfeedSnapshot('ada','foryou',new Date(),['last'])).toMatchObject({ids:[],degraded:true});expect(deps.recommend).not.toHaveBeenCalled();expect(deps.history).not.toHaveBeenCalled();
});
it('stores bounded delivered history with expiry and never lets Redis failures break feed delivery',async()=>{
 await rememberDeliveredRecommendations('ada',['last']);expect(deps.zAdd).toHaveBeenCalledWith('feed:recommended:ada',[{score:expect.any(Number),value:'last'}]);
 expect(deps.trim).toHaveBeenCalledWith('feed:recommended:ada',0,-2001);expect(deps.expire).toHaveBeenCalledWith('feed:recommended:ada',86400);
 deps.exec.mockRejectedValue(Error('redis down'));await expect(rememberDeliveredRecommendations('ada',['new'])).resolves.toBeUndefined();
});

it('coalesces simultaneous tabs and reuses the same ranked snapshot without sharing client baselines',async()=>{
 deps.history.mockResolvedValue([]);deps.recommend.mockResolvedValue({data:{recommendations:[{id:'one'},{id:'two'}]}});
 deps.findMany.mockImplementation(({where})=>Promise.resolve(where.id.in.map((id:string)=>({id,user:{id:'author',name:'A',avatar:null}}))));
 const [first,second]=await Promise.all([getAvailableNewsfeedSnapshot('ada','foryou',new Date(),['one']),getAvailableNewsfeedSnapshot('ada','foryou',new Date(),['two'])]);
 expect(first.ids).toEqual(['two']);expect(second.ids).toEqual(['one']);expect(deps.recommend).toHaveBeenCalledTimes(1);
 await getAvailableNewsfeedSnapshot('ada','foryou',new Date());expect(deps.recommend).toHaveBeenCalledTimes(1);
});
it('refreshes after the shared one-minute window and does not restart inference on model failures',async()=>{
 vi.useFakeTimers();
 try {
  deps.history.mockResolvedValue([]);deps.findMany.mockResolvedValue([]);deps.recommend.mockRejectedValue(Error('model down'));
  expect(await getAvailableNewsfeedSnapshot('ada','foryou',new Date())).toMatchObject({degraded:true});
  await getAvailableNewsfeedSnapshot('ada','foryou',new Date());expect(deps.recommend).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60001);await getAvailableNewsfeedSnapshot('ada','foryou',new Date());expect(deps.recommend).toHaveBeenCalledTimes(2);
 } finally {vi.useRealTimers();}
});
it('does not publish results after losing lease ownership',async()=>{
 deps.history.mockResolvedValue([]);deps.recommend.mockResolvedValue({data:{recommendations:[{id:'stale'}]}});
 deps.eval.mockResolvedValue(0);
 expect(await getAvailableNewsfeedSnapshot('ada','foryou',new Date())).toMatchObject({ids:[],degraded:true});expect(deps.findMany).not.toHaveBeenCalled();
});

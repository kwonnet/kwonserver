import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
vi.mock('@/utils/webpush',()=>({default:{}}));
import {claimEngagementTask,getEngagementTasks,configureEngagementTask,rotateEngagementRewards} from '@/services/v1/tasks';
import {getAvailableNewsfeedIds,getAvailableNewsfeedPosts,injectPostBoosts,createPostImpression} from '@/services/v1/posts';
import {createUser} from '@/services/v1/auth';
const db=new PrismaClient();const prefix='engagement-fixture-';let actor:string,author:string,viewer:string;
async function user(name:string){return (await db.user.create({data:{name,username:prefix+name,email:prefix+name+'@test.invalid',wallet:{create:{bonus:0}}}})).id;}
async function post(userId:string,extra:any={}){return db.post.create({data:{userId,kind:'ROOT',type:'CONTENT',content:'A community post with real content',...extra}});}
beforeAll(async()=>{actor=await user('actor');author=await user('author');viewer=await user('viewer');await db.engagementTask.update({where:{id:'like'},data:{target:2,reward:15,rewardDay:new Date(new Date().toISOString().slice(0,10)),enabled:true}});});
afterAll(async()=>{const users=await db.user.findMany({where:{email:{startsWith:prefix}},select:{id:true}});const ids=users.map(user=>user.id);await db.postImpression.deleteMany({where:{userId:{in:ids}}});await db.post.deleteMany({where:{userId:{in:ids}}});await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
it('verifies distinct actions, protects parallel claims and credits exactly one bonus ledger',async()=>{
 const one=await post(author),two=await post(author),own=await post(actor);
 await db.likedPost.createMany({data:[{userId:actor,postId:one.id},{userId:actor,postId:own.id}]});
 await expect(claimEngagementTask(actor,'like','first-request-key')).rejects.toThrow('Progress: 1/2');
 expect((await db.wallet.findUniqueOrThrow({where:{userId:actor}})).bonus.toNumber()).toBe(0);
 await db.likedPost.create({data:{userId:actor,postId:two.id}});
 const results=await Promise.allSettled([claimEngagementTask(actor,'like','claim-request-one'),claimEngagementTask(actor,'like','claim-request-two')]);
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
 const successful=results[0].status==='fulfilled'?'claim-request-one':'claim-request-two';
 await claimEngagementTask(actor,'like',successful);
 expect((await db.wallet.findUniqueOrThrow({where:{userId:actor}})).bonus.toNumber()).toBe(15);
 expect(await db.engagementClaim.count({where:{userId:actor,taskId:'like'}})).toBe(1);
 expect(await db.transaction.count({where:{userId:actor,category:'APP_TASK'}})).toBe(1);
 expect((await getEngagementTasks(actor)).find(task=>task.id==='like')).toMatchObject({eligible:false,progress:0});
 await db.engagementClaim.updateMany({where:{userId:actor,taskId:'like'},data:{claimedAt:new Date(Date.now()-25*3600000)}});
 await db.likedPost.deleteMany({where:{userId:actor}});await db.likedPost.createMany({data:[{userId:actor,postId:one.id},{userId:actor,postId:two.id}]});
 await expect(claimEngagementTask(actor,'like','next-cycle-key')).rejects.toThrow('Progress: 0/2');
 await configureEngagementTask('like',{enabled:false});await expect(claimEngagementTask(viewer,'like','disabled-task-key')).rejects.toThrow('unavailable');
 await configureEngagementTask('like',{enabled:true});
});
it('rolls daily reward snapshots once, including disabled tasks, bounded at fifteen',async()=>{
 await db.engagementTask.update({where:{id:'like'},data:{reward:2,rewardDay:new Date(new Date().toISOString().slice(0,10)+'T00:00:00Z')}});
 await rotateEngagementRewards();expect((await db.engagementTask.findUniqueOrThrow({where:{id:'like'}})).reward).toBeGreaterThanOrEqual(5);
 await db.engagementTask.updateMany({data:{rewardDay:new Date('2020-01-01')}});await rotateEngagementRewards();const first=await db.engagementTask.findMany();await rotateEngagementRewards();expect(await db.engagementTask.findMany()).toEqual(first);expect(first.every(task=>task.reward>=5&&task.reward<=15)).toBe(true);
});
it('reserves boosts once per viewer, excludes private/own posts and counts genuine acknowledgements once',async()=>{
 const publicPost=await post(author),privatePost=await post(author,{scope:'FOLLOWED'}),hidden=await post(author,{isHidden:true}),own=await post(viewer);
 expect(await db.postBoost.findUnique({where:{postId:publicPost.id}})).toMatchObject({target:150,confirmed:0});
 expect(await db.postBoost.findUnique({where:{postId:privatePost.id}})).toBeNull();expect(await db.postBoost.findUnique({where:{postId:hidden.id}})).toBeNull();
 const person:any={id:viewer,name:'Viewer',username:prefix+'viewer',role:'USER'};
 const pages=await Promise.all([injectPostBoosts([],person),injectPostBoosts([],person)]);
 const delivered=pages.flat() as any[]; const ids=delivered.map(post=>post.id);
 expect(new Set(ids).size).toBe(ids.length);expect(ids.length).toBeGreaterThan(0);expect(ids.length).toBeLessThanOrEqual(8);expect(ids).not.toContain(own.id);expect(ids).not.toContain(privatePost.id);expect(delivered.every(post=>post.boost?.label==='Community boost')).toBe(true);
 const later=await injectPostBoosts([],person) as any[];expect(later.some(post=>ids.includes(post.id))).toBe(false);
 const args:any={device:{},meta:null,postId:publicPost.id,userId:viewer,sessionId:'viewport',timestamp:new Date().toISOString()};
 await createPostImpression(args);await createPostImpression(args);
 expect(await db.postBoost.findUnique({where:{postId:publicPost.id}})).toMatchObject({confirmed:1});
 await createPostImpression({...args,userId:author});expect(await db.postBoost.findUnique({where:{postId:publicPost.id}})).toMatchObject({confirmed:1});
 await db.postBoost.update({where:{postId:publicPost.id},data:{expiresAt:new Date(0)}});
 await createPostImpression({...args,userId:actor});expect(await db.postBoost.findUnique({where:{postId:publicPost.id}})).toMatchObject({confirmed:1});
});
it('persists one welcome event only after a successful first registration',async()=>{
 const email=prefix+'signup@test.invalid';const result=await createUser({name:'New creator',email,password:'test-password'});expect(result.status).toBe(200);const id=(result.data as any).id;
 expect(await db.emailMessage.findMany({where:{userId:id}})).toMatchObject([{eventKey:`welcome:${id}`,kind:'WELCOME',status:'PENDING'}]);
 expect((await createUser({name:'Duplicate',email,password:'test-password'})).status).toBe(422);expect(await db.emailMessage.count({where:{userId:id}})).toBe(1);
});

it('allows organic repeats only after the server cooldown and never counts a feed delivery',async()=>{
 const root=await post(author);const args:any={device:{},meta:null,postId:root.id,userId:viewer,sessionId:'viewport',timestamp:new Date().toISOString()};
 await createPostImpression(args);await db.postBoostView.update({where:{postId_userId:{postId:root.id,userId:viewer}},data:{createdAt:new Date(Date.now()-151000)}});
 await createPostImpression(args);expect(await db.postBoost.findUnique({where:{postId:root.id}})).toMatchObject({confirmed:2});
});

it('aggregates only visible posts and rechecks pending snapshots at consumption',async()=>{
 const since=new Date(Date.now()-1000);
 const visible=await post(author),privatePost=await post(author,{scope:'FOLLOWED'}),draft=await post(author,{status:'DRAFT'});
 const ids=await getAvailableNewsfeedIds(viewer,'latest',since);
 expect(ids).toContain(visible.id);expect(ids).not.toContain(privatePost.id);expect(ids).not.toContain(draft.id);
 expect(await getAvailableNewsfeedIds(viewer,'following',since)).not.toContain(visible.id);
 const person:any={id:viewer,name:'Viewer',username:prefix+'viewer',role:'USER'};
 const result=await getAvailableNewsfeedPosts(person,'latest',[visible.id,privatePost.id,draft.id]);
 expect(result.status).toBe(200);expect((result.data as any[]).map(post=>post.id)).toEqual([visible.id]);
 await db.post.update({where:{id:visible.id},data:{isHidden:true}});
 const hidden=await getAvailableNewsfeedPosts(person,'latest',[visible.id]);expect(hidden.data).toEqual([]);
});

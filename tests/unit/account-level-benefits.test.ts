import {expect,it,vi} from 'vitest';
vi.mock('@/db',()=>({default:{}}));
import {boostRoundScore,postCharacterCount,assertPostLength,getAccountBenefits} from '@/services/v1/subscriptions/benefits';
it.each([[0,0,0],[0,1500,0],[-10,1500,-10],[1,500,2],[10,500,11],[10,1000,11],[10,1500,12],[100,1500,115]])('boosts %i by %i basis points to %i', (score,bps,expected)=>expect(boostRoundScore(score,bps)).toBe(expected));
it('counts emoji graphemes, combining marks, spaces and newlines consistently',()=>{
 expect(postCharacterCount('👨‍👩‍👧‍👦👍🏽🇳🇬e\u0301 a\n')).toBe(7);
 expect(()=>assertPostLength([{content:'👍🏽'.repeat(280)}],280)).not.toThrow();
 expect(()=>assertPostLength([{content:'👍🏽'.repeat(281)}],280)).toThrow('280');
 expect(()=>assertPostLength([{content:'a'.repeat(25000)}],25000)).not.toThrow();
 expect(()=>assertPostLength([{content:'a'.repeat(25001)}],25000)).toThrow('25,000');
});
it('requires a currently valid primary ACTIVE subscription and otherwise uses level zero',async()=>{
 const db:any={subscription:{findFirst:vi.fn(async()=>null)},accountLevelBenefit:{findUniqueOrThrow:vi.fn(async()=>({level:0,version:1}))}};
 expect((await getAccountBenefits('u',db)).level).toBe(0);
 expect(db.subscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({userId:'u',isPrimary:true,status:'ACTIVE',startDate:{lte:expect.any(Date)},endDate:{gt:expect.any(Date)}})}));
 db.subscription.findFirst.mockResolvedValue({id:'sub',endDate:new Date(Date.now()+1000),plan:{benefits:{level:3,version:1}}});
 expect(await getAccountBenefits('u',db)).toMatchObject({level:3,subscriptionId:'sub'});
});

import {expect, it} from 'vitest';
import {createMonthlyRewardCurve, monthlyRewardAtRank, monthlyRewardTier, MONTHLY_REWARD_CAP, monthlyRewardFunding} from '@/services/walletLedger/monthlyRewards';

it.each([
 [0,20,25,0], [4,20,25,0], [5,20,25,1], [5_000_000,20,25,1_000_000],
 [5_000_001,25,30,1_250_000], [10_000_000,25,30,2_500_000],
 [10_000_001,30,35,3_000_000], [50_000_000,30,35,15_000_000],
 [50_000_001,32,37,16_000_000], [100_000_000,32,37,32_000_000],
 [100_000_001,35,40,35_000_000],
])('uses the agreed participant and funding bands for %s players', (count,qualifyingPercent,poolPercent,winners)=>{
 expect(monthlyRewardTier(count)).toEqual({qualifyingPercent,poolPercent,winners});
});
it.each([-1,NaN,Infinity,1.5])('rejects invalid participant count %s',count=>expect(()=>monthlyRewardTier(count)).toThrow());

it('sets a 90% minimum and 5x target and distributes the exact pool',()=>{
 const curve=createMonthlyRewardCurve(595_000_000*100,10_000);
 expect(curve.minimum).toBe(53_550*100);
 expect(monthlyRewardAtRank(curve,1)).toBe(297_500*100);
 expect(monthlyRewardAtRank(curve,10_000)).toBeGreaterThanOrEqual(53_550*100);
 expect(Array.from({length:10_000},(_,i)=>monthlyRewardAtRank(curve,i+1)).reduce((a,b)=>a+b,0)).toBe(curve.pool);
});

it('honours the 500k ceiling without allowing an unaffordable floor',()=>{
 const curve=createMonthlyRewardCurve(10_000*200_000*100,10_000);
 expect(monthlyRewardAtRank(curve,1)).toBe(MONTHLY_REWARD_CAP);
 expect(curve.minimum).toBe(180_000*100);
});

it('accounts explicitly for pool amounts exceeding all winners combined capacity',()=>{
 const curve=createMonthlyRewardCurve(1_000_001*100,2);
 expect(curve.budget).toBe(1_000_000*100);
 expect(curve.unallocated).toBe(100);
 expect(monthlyRewardAtRank(curve,1)).toBe(500_000*100);
 expect(monthlyRewardAtRank(curve,2)).toBe(500_000*100);
});

it('conserves cents, keeps rank order, and respects the cap across small/large and scarce/full budgets',()=>{
 for(const n of [0,1,2,3,5,100,10_000]) {
  for(const pool of [0,1,17,100,n*100+1,n*MONTHLY_REWARD_CAP-1,n*MONTHLY_REWARD_CAP,n*MONTHLY_REWARD_CAP+123].filter(p=>p>=0)) {
   const curve=createMonthlyRewardCurve(pool,n);
   let total=0,previous=Infinity;
   for(let rank=1;rank<=n;rank++) {
    const value=monthlyRewardAtRank(curve,rank);
    expect(Number.isSafeInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(Math.min(previous,MONTHLY_REWARD_CAP));
    previous=value;total+=value;
   }
   expect(total+curve.unallocated).toBe(pool);
  }
 }
});
it('rejects invalid ranks and noninteger budgets',()=>{
 expect(()=>createMonthlyRewardCurve(0.5,10)).toThrow();
 const curve=createMonthlyRewardCurve(100,5);
 expect(()=>monthlyRewardAtRank(curve,0)).toThrow();
 expect(()=>monthlyRewardAtRank(curve,6)).toThrow();
});

it.each([
 ['50000','10000',25,1_000_000,'40000.00'],
 ['1200','800',25,10_000,'400.00'],
 ['100','100',40,0,'0.00'],
 ['100','150',40,0,'0.00'],
 ['100','0',25,2_500,'100.00'],
 ['0.05','0.01',25,1,'0.04'],
 ['0.05','0.02',25,0,'0.03'],
])('funds coins=%s bonus=%s at %s percent from their nonnegative difference',(coins,bonus,rate,poolMinor,fundingBalance)=>{
 expect(monthlyRewardFunding(coins,bonus,rate)).toMatchObject({poolMinor,fundingBalance});
});
it.each([['-1','0',25],['10','-1',25],['NaN','0',25],['10','0',101]] as const)('rejects invalid funding %s/%s/%s',(coins,bonus,rate)=>{
 expect(()=>monthlyRewardFunding(coins,bonus,rate)).toThrow();
});

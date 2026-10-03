import {Prisma} from '@prisma/client';
import {expect,it,vi} from 'vitest';
vi.mock('@/db',()=>({default:{}}));
import {cents,requestKey,lockWallets} from '@/services/walletLedger';
import {nextBillingDate,subscriptionPrice} from '@/services/walletLedger/pricing';
it.each([NaN,Infinity,-1,0,1.001])('rejects unsafe amount %s',value=>expect(()=>cents(value)).toThrow());
it('calculates in minor units and permits zero only explicitly',()=>{expect(cents(0,true)).toBe(0);expect(cents(1.23)).toBe(123);expect(cents(new Prisma.Decimal("0.1").plus("0.2"))).toBe(30);});
it('requires valid operation keys',()=>{expect(()=>requestKey(undefined)).toThrow("Idempotency-Key is required");expect(requestKey('request-123')).toBe('request-123');expect(()=>requestKey({})).toThrow();});
it('locks distinct wallets in deterministic order',async()=>{const tx={$queryRaw:vi.fn().mockResolvedValue([{id:'w'}])};await lockWallets(tx as any,['z','a','z']);expect(tx.$queryRaw.mock.calls.map(call=>call[1])).toEqual(['a','z']);});
it.each([['2026-01-31T12:00:00Z','MONTHLY','2026-02-28T12:00:00.000Z'],['2024-02-29T12:00:00Z','YEARLY','2025-02-28T12:00:00.000Z']] as const)('clamps the %s billing boundary', (start,cycle,end)=>expect(nextBillingDate(new Date(start),cycle).toISOString()).toBe(end));
it('prices tiers, annual discounts and currencies from the catalog',()=>{
 const plan={price:5,ngnPrice:5000,discount:0.1,tier:[{id:'tier',price:10,ngnPrice:10000}]};
 expect(subscriptionPrice(plan,'YEARLY','TZX','tier')).toBe(108);expect(subscriptionPrice(plan,'MONTHLY','NGN','tier')).toBe(10000);
 expect(()=>subscriptionPrice(plan,'MONTHLY','TZX','forged')).toThrow();
});

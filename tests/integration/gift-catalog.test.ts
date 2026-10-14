import {it,expect} from 'vitest';
import prisma from '@/db';
import {seedTipPackages,tipPackages} from '../../prisma/seed';
it('replaces the catalog idempotently while preserving old gifts and wallet history',async()=>{
 await prisma.$transaction(async tx=>{
  await tx.user.createMany({data:['catalog-sender','catalog-receiver'].map(id=>({id,name:id,username:id,email:`${id}@example.test`}))});
  await tx.tipPackage.create({data:{id:'catalog-old',name:'Old Gift',price:20,thumbnail:'/old.webp'}});
  const wallet=await tx.wallet.create({data:{userId:'catalog-receiver',coins:10}});
  const ledger=await tx.transaction.create({data:{userId:'catalog-receiver',walletId:wallet.id,amount:10,currency:'COINS',source:'COINS',gateway:'WALLET',category:'POST_TIP',status:'COMPLETED',type:'CREDIT',tipPackageId:'catalog-old',txnRef:'catalog-ledger',description:'Gift history'}});
  await tx.postTip.create({data:{senderId:'catalog-sender',recipientId:'catalog-receiver',tipId:'catalog-old',coinsAmount:20,rewardTip:{create:{userId:'catalog-receiver',walletId:wallet.id,txnId:ledger.id,amount:10,source:'PROFILE',status:'SETTLED',availableAt:new Date(),settledAt:new Date()}}}});
  await seedTipPackages(tx);
  expect(await tx.tipPackage.count()).toBe(50);expect(await tx.tipPackage.findUnique({where:{id:'catalog-old'}})).toBeNull();
  expect(await tx.postTip.findFirst({where:{senderId:'catalog-sender'}})).toMatchObject({tipId:null,giftName:'Old Gift',giftThumbnail:'/old.webp'});
  expect(await tx.transaction.findUnique({where:{id:ledger.id}})).toMatchObject({tipPackageId:null,status:'COMPLETED'});
  expect(await tx.rewardTip.count({where:{txnId:ledger.id,status:'SETTLED'}})).toBe(1);
  expect((await tx.wallet.findUniqueOrThrow({where:{id:wallet.id}})).coins.toNumber()).toBe(10);
  const before=await tx.tipPackage.findMany({orderBy:{id:'asc'},select:{id:true,price:true,thumbnail:true}});
  await seedTipPackages(tx);expect(await tx.tipPackage.findMany({orderBy:{id:'asc'},select:{id:true,price:true,thumbnail:true}})).toEqual(before);
  expect(new Set(before.map(g=>g.id))).toEqual(new Set(tipPackages.map(g=>g.id)));
  // Roll back fixtures and replacement so this test cannot alter other fixtures.
  throw new Error('rollback catalog probe');
 },{timeout:30000}).catch(error=>{if(error.message!=='rollback catalog probe')throw error;});
});

import {Prisma} from '@prisma/client';
import prisma from '@/db';
import {WalletError} from '@/services/walletLedger';
export async function getAccountBenefits(userId:string,db:Prisma.TransactionClient=prisma) {
 const now=new Date();
 const sub=await db.subscription.findFirst({where:{userId,isPrimary:true,status:'ACTIVE',startDate:{lte:now},endDate:{gt:now}},orderBy:[{endDate:'desc'},{id:'asc'}],include:{plan:{include:{benefits:true}}}});
 const benefits=sub?.plan.benefits ?? await db.accountLevelBenefit.findUniqueOrThrow({where:{level:0}});
 const {createdAt,updatedAt,...policy}=benefits;
 return {...policy,subscriptionId:sub?.id??null,validUntil:sub?.endDate.toISOString()??null};
}
const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});
export function postCharacterCount(text:string) {return Array.from(segmenter.segment(text)).length;}
export function assertPostLength(threads:{content:string}[],maximum:number) {
 if(threads.some(post=>postCharacterCount(post.content)>maximum))throw new WalletError(`Posts can contain at most ${maximum.toLocaleString('en-US')} characters, including emojis`,400);
}
export function boostRoundScore(score:number,bps:number) {
 if(!Number.isSafeInteger(score)||!Number.isSafeInteger(bps)||bps<0||bps>10000)throw new Error('Invalid game boost');
 if(score<=0)return score;
 return Math.max(1,Number((BigInt(score)*BigInt(10000+bps)+9999n)/10000n));
}

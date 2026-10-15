import {it,expect} from 'vitest';
import prisma from '@/db';
import {syncCountryGameThumbnails,countryGameThumbnail} from '../../prisma/seed';
it('backfills Cloudflare country thumbnails and room flags without recreating game data',async()=>{
 try {
  await prisma.$transaction(async tx=>{
   const game=await tx.game.create({data:{name:'Country Mania',description:'Flag seed probe',modes:['MULTI'],categories:{create:[{name:'Nigeria',description:'Preserve country description',topics:['Existing topic'],rooms:{create:{name:'Lagos',description:'Preserve room description',capacity:9,thumbnail:'/old.webp'}}},{name:'New Zealand',description:'Second country',rooms:{create:{name:'Auckland',description:'Second room'}}}] }},include:{categories:{include:{rooms:true}}}});
   const unrelated=await tx.game.create({data:{name:'Trivia probe',description:'Other catalog',modes:['MULTI'],categories:{create:{name:'Nigeria',description:'Unrelated category',thumbnail:'/preserved.webp'}}},include:{categories:true}});
   await syncCountryGameThumbnails(tx);
   for(const category of game.categories){
    const expected=countryGameThumbnail(category.name);
    expect(expected).toContain('/static/flags/');expect(expected).toMatch(/^https:\/\//);
    expect(await tx.gameCategory.findUniqueOrThrow({where:{id:category.id}})).toMatchObject({name:category.name,description:category.description,thumbnail:expected,topics:category.topics});
    for(const room of category.rooms)expect(await tx.gameRoom.findUniqueOrThrow({where:{id:room.id}})).toMatchObject({name:room.name,capacity:room.capacity,thumbnail:expected});
   }
   expect((await tx.gameCategory.findUniqueOrThrow({where:{id:unrelated.categories[0].id}})).thumbnail).toBe('/preserved.webp');
   expect(await syncCountryGameThumbnails(tx)).toEqual({categoriesUpdated:0,roomsUpdated:0});
   throw new Error('rollback country flag probe');
  },{timeout:30000});
 } catch(error) {if(!(error instanceof Error)||error.message!=='rollback country flag probe')throw error;}
});

import {it,expect} from 'vitest';
import prisma from '@/db';
import {syncCountryGameThumbnails,countryGameThumbnail,syncGameBannerThumbnails,gameBannerThumbnail} from '../../prisma/seed';
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

it('backfills main banners and inherited room artwork while preserving country flags and unrelated games',async()=>{
 try {
  await prisma.$transaction(async tx=>{
   const created=[];
   for(const name of ['Trivia & Quiz','Acronym Arcade','Academia Adventure','Sports & Games','MindMash','Country Mania','Unrelated probe']){
    created.push(await tx.game.create({data:{name,description:'Preserve game',modes:['MULTI'],thumbnail:'/old-game.webp',categories:{create:{name:name==='Country Mania'?'Nigeria':'Category',description:'Preserve category',topics:['Existing'],thumbnail:'/old-category.webp',rooms:{create:{name:'Room',description:'Preserve room',capacity:9,thumbnail:'/old-room.webp'}}}}},include:{categories:{include:{rooms:true}}}}));
   }
   await syncGameBannerThumbnails(tx);
   await syncCountryGameThumbnails(tx);
   for(const game of created){
    const banner=gameBannerThumbnail(game.name);
    expect(await tx.game.findUniqueOrThrow({where:{id:game.id}})).toMatchObject({description:'Preserve game',thumbnail:banner??'/old-game.webp'});
    const category=game.categories[0];
    const child=game.name==='Country Mania'?countryGameThumbnail('Nigeria'):banner;
    expect(await tx.gameCategory.findUniqueOrThrow({where:{id:category.id}})).toMatchObject({description:'Preserve category',topics:['Existing'],thumbnail:child??'/old-category.webp'});
    expect(await tx.gameRoom.findUniqueOrThrow({where:{id:category.rooms[0].id}})).toMatchObject({description:'Preserve room',capacity:9,thumbnail:child??'/old-room.webp'});
   }
   expect(await syncGameBannerThumbnails(tx)).toEqual({gamesUpdated:0,categoriesUpdated:0,roomsUpdated:0});
   expect(await syncCountryGameThumbnails(tx)).toEqual({categoriesUpdated:0,roomsUpdated:0});
   throw new Error('rollback banner probe');
  },{timeout:30000});
 } catch(error){if(!(error instanceof Error)||error.message!=='rollback banner probe')throw error;}
});

import {it, expect} from 'vitest';
import prisma from '@/db';
import {genericGameRooms, syncGenericGameRooms} from '../../prisma/seed';

it('renames existing rooms in batches without changing their parent, content, capacity or country rooms', async () => {
  try {
    await prisma.$transaction(async tx => {
      const sports = await tx.game.create({
        data: {
          name: 'Sports & Games', description: 'Sports', modes: ['MULTI'],
          categories: {create: {
            name: 'Football', description: 'Old category description', topics: ['Clubs', 'National Teams'],
            rooms: {create: Array.from({length: 205}, (_, index) => ({
              name: index === 0 ? 'WorldCup' : `Old topic ${index}`,
              description: 'Only world cup questions', capacity: 9, thumbnail: '/preserved.webp',
              createdAt: new Date(1700000000000 + index),
            }))},
          }},
        }, include: {categories: {include: {rooms: {orderBy: [{createdAt: 'asc'}, {id: 'asc'}]}}}},
      });
      const mind = await tx.game.create({data: {
        name: 'MindMash', description: 'Word games', modes: ['MULTI'],
        categories: {create: {name: 'Hangman', description: 'Old description', rooms: {create: {name: 'Hard', description: 'Difficult words only'}}}},
      }, include: {categories: {include: {rooms: true}}}});
      const country = await tx.game.create({data: {
        name: 'Country Mania', description: 'Countries', modes: ['MULTI'],
        categories: {create: {name: 'Nigeria', description: 'Country description', topics: ['Cities'], rooms: {create: {name: 'Lagos', description: 'City description', thumbnail: '/static/flags/nigeria.webp'}}}},
      }, include: {categories: {include: {rooms: true}}}});
      const extra = await tx.game.create({data: {
        name: 'Additional game', description: 'Additional catalog', modes: ['MULTI'],
        categories: {create: {name: 'Additional category', description: 'Keep category content',
          rooms: {create: {name: 'Additional category Room 01', description: 'Old room text'}}}},
      }, include: {categories: {include: {rooms: true}}}});
      const originalCountry = country.categories[0];
      expect(await syncGenericGameRooms(tx)).toEqual({categoriesUpdated: 2, roomsUpdated: 207});
      const football = sports.categories[0];
      const updated = await tx.gameCategory.findUniqueOrThrow({where: {id: football.id}, include: {rooms: {orderBy: [{createdAt: 'asc'}, {id: 'asc'}]}}});
      expect(updated.topics).toEqual(football.topics);
      expect(updated.description).not.toContain('Every room draws questions from the full category pool');
      expect(updated.rooms).toHaveLength(205);
      const labels = genericGameRooms('Football', 205);
      updated.rooms.forEach((room, index) => {
        expect(room).toMatchObject({...labels[index], id: football.rooms[index].id, catId: football.id, capacity: 9, thumbnail: '/preserved.webp', createdAt: football.rooms[index].createdAt});
      });
      expect(await tx.gameRoom.findUniqueOrThrow({where: {id: mind.categories[0].rooms[0].id}})).toMatchObject({name: 'Room 1', description: genericGameRooms('Hangman', 1, true)[0].description});
      expect(await tx.gameCategory.findUniqueOrThrow({where: {id: originalCountry.id}, include: {rooms: true}})).toEqual(originalCountry);
      expect(await tx.gameRoom.findUniqueOrThrow({where: {id: extra.categories[0].rooms[0].id}})).toMatchObject({name: 'Room 1', catId: extra.categories[0].id});
      expect((await tx.gameCategory.findUniqueOrThrow({where: {id: extra.categories[0].id}})).description).toBe('Keep category content');
      expect(await syncGenericGameRooms(tx)).toEqual({categoriesUpdated: 0, roomsUpdated: 0});
      throw new Error('rollback generic room probe');
    }, {timeout: 30000});
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'rollback generic room probe') throw error;
  }
});

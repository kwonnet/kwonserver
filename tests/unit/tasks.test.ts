import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ task: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  userTask: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() } }));
vi.mock('@/db', () => ({ default: db }));
import * as tasks from '@/services/v1/tasks';
beforeEach(() => { for (const model of Object.values(db)) for (const fn of Object.values(model)) fn.mockReset(); });
it('rejects already completed tasks before fetching their definition', async () => {
  db.userTask.findFirst.mockResolvedValue({ id: 'done' });
  expect(await tasks.checkUserTask('u', 't')).toEqual({ status: 402, data: 'Task already done' });
  expect(db.task.findFirst).not.toHaveBeenCalled();
});
it('rejects missing tasks and returns valid tasks', async () => {
  db.task.findFirst.mockResolvedValue(null); expect((await tasks.checkUserTask('u', 't')).status).toBe(402);
  db.task.findFirst.mockResolvedValue({ id: 't' }); expect(await tasks.checkUserTask('u', 't')).toEqual({ status: 200, data: { id: 't' } });
});
it('creates completion records for the specified user and task', async () => {
  db.userTask.create.mockResolvedValue({ id: 'done' }); expect((await tasks.insertUserTask('u', 't')).status).toBe(200);
  expect(db.userTask.create).toHaveBeenCalledWith({ data: { taskId: 't', userId: 'u' } });
});
it('creates tasks with the authenticated owner', async () => {
  const task: any = { title: 'Task', description: 'Details', url: 'https://example.test', reward: 5, rewardType: 'COINS' };
  db.task.create.mockResolvedValue({ id: 't', ...task }); expect((await tasks.createTask(task, 'u')).status).toBe(200);
  expect(db.task.create).toHaveBeenCalledWith({ data: { ...task, userId: 'u' } });
});
it('paginates only incomplete tasks in descending date order', async () => {
  db.task.findMany.mockResolvedValue([{ id: 't' }]); expect((await tasks.getTasks('u', { page: 3, limit: 10 })).status).toBe(200);
  expect(db.task.findMany).toHaveBeenCalledWith({ where: { performedBy: { none: { userId: 'u' } } }, skip: 20, take: 10, orderBy: [{ createdAt: 'desc' }] });
});
it('maps completed records to task data scoped to the requesting user', async () => {
  db.userTask.findMany.mockResolvedValue([{ task: { id: 't' } }]);
  expect(await tasks.getUserCompletedTasks('u', { page: 2, limit: 5 })).toEqual({ status: 200, data: [{ id: 't' }] });
  expect(db.userTask.findMany).toHaveBeenCalledWith({ where: { userId: 'u' }, skip: 5, take: 5, orderBy: [{ createdAt: 'desc' }], include: { task: true } });
});
it.each(['getTasks', 'getUserCompletedTasks'] as const)('%s returns 404 for empty results', async name => {
  db.task.findMany.mockResolvedValue([]); db.userTask.findMany.mockResolvedValue([]);
  expect((await tasks[name]('u', { page: 1, limit: 10 })).status).toBe(404);
});
it('gets a single task or returns 404', async () => {
  db.task.findFirst.mockResolvedValue(null); expect((await tasks.getTask('t')).status).toBe(404);
  db.task.findFirst.mockResolvedValue({ id: 't' }); expect((await tasks.getTask('t')).data).toEqual({ id: 't' });
});
it.each([
  ['checkUserTask', 'userTask', 'findFirst', ['u', 't']], ['insertUserTask', 'userTask', 'create', ['u', 't']],
  ['createTask', 'task', 'create', [{}, 'u']], ['getTasks', 'task', 'findMany', ['u', { page: 1, limit: 5 }]],
  ['getTask', 'task', 'findFirst', ['t']], ['getUserCompletedTasks', 'userTask', 'findMany', ['u', { page: 1, limit: 5 }]],
])('%s handles storage failures', async (name, model, method, args) => {
  (db as any)[model as string][method as string].mockRejectedValue(new Error('secret db error'));
  const result = await (tasks as any)[name as string](...(args as unknown[]));
  expect(result.status).toBe(500); expect(result.data).not.toContain('secret db error');
});

"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserCompletedTasks = exports.getTask = exports.getTasks = exports.createTask = exports.insertUserTask = exports.checkUserTask = void 0;
const db_1 = __importDefault(require("@/db"));
const checkUserTask = (userId, taskId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userTask = yield db_1.default.userTask.findFirst({
            where: { userId, taskId },
            include: { task: true },
        });
        if (userTask) {
            return { data: "Task already done", status: 402 };
        }
        const task = yield db_1.default.task.findFirst({ where: { id: taskId } });
        if (!task) {
            return { data: "Task not found", status: 402 };
        }
        return { data: task, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.checkUserTask = checkUserTask;
const insertUserTask = (userId, taskId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const task = yield db_1.default.userTask.create({ data: { taskId, userId } });
        return { data: task, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.insertUserTask = insertUserTask;
const createTask = (task, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.task.create({ data: Object.assign(Object.assign({}, task), { userId }) });
        return { data: result, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.createTask = createTask;
const getTasks = (userId_1, _a) => __awaiter(void 0, [userId_1, _a], void 0, function* (userId, { page, limit, }) {
    try {
        const skip = (page - 1) * limit;
        const result = yield db_1.default.task.findMany({
            where: {
                performedBy: {
                    none: {
                        userId,
                    },
                },
            },
            skip,
            take: limit,
            orderBy: [{ createdAt: "desc" }],
        });
        return result.length === 0
            ? { status: 404, data: "Not found" }
            : { status: 200, data: result };
    }
    catch (error) {
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getTasks = getTasks;
const getTask = (id) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.task.findFirst({
            where: { id },
        });
        if (!result)
            return { data: "Not found", status: 404 };
        return { status: 200, data: result };
    }
    catch (error) {
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getTask = getTask;
const getUserCompletedTasks = (userId_1, _a) => __awaiter(void 0, [userId_1, _a], void 0, function* (userId, { page, limit, }) {
    try {
        const skip = (page - 1) * limit;
        const result = yield db_1.default.userTask.findMany({
            where: {
                userId,
            },
            skip,
            take: limit,
            orderBy: [{ createdAt: "desc" }],
            include: { task: true }
        });
        //   const result = await prisma.task.findMany({
        //     where: {
        //       performedBy: {
        //         some: {
        //           userId,
        //         },
        //       },
        //     },
        //     skip,
        //     take: limit,
        //     orderBy: [{ createdAt: "desc" }],
        //   });
        return result.length === 0
            ? { status: 404, data: "Not found" }
            : { status: 200, data: result.map(r => r.task) };
    }
    catch (error) {
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getUserCompletedTasks = getUserCompletedTasks;

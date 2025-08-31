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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserCompletedTasksController = exports.getTaskController = exports.getTasksController = exports.createTaskController = void 0;
const schema_1 = require("@/schema");
const tasks_1 = require("@/services/v1/tasks");
const utils_1 = require("@/utils");
const createTaskController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.TaskZodSchema);
        if (!zodResult.data)
            return res.status(400).send(zodResult.message);
        const result = yield (0, tasks_1.createTask)(zodResult.data, user.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(400)
            .send("Error: Unable to process request, please try again later!");
    }
});
exports.createTaskController = createTaskController;
const getTasksController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const zodResult = (0, utils_1.validateZodInput)(req.query, schema_1.QuerySchema);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, tasks_1.getTasks)(user.id, zodData);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(400)
            .send("Error: Unable to process request, please try again later!");
    }
});
exports.getTasksController = getTasksController;
const getTaskController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = (0, utils_1.validateZodInput)(req.params, schema_1.IDZodSchema);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, tasks_1.getTask)(zodData.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(400)
            .send("Error: Unable to process request, please try again later!");
    }
});
exports.getTaskController = getTaskController;
const getUserCompletedTasksController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const zodResult = (0, utils_1.validateZodInput)(req.query, schema_1.QuerySchema);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, tasks_1.getUserCompletedTasks)(user.id, zodData);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(400)
            .send("Error: Unable to process request, please try again later!");
    }
});
exports.getUserCompletedTasksController = getUserCompletedTasksController;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const socketIo_1 = __importDefault(require("./socketIo"));
const cors_1 = __importDefault(require("cors"));
const bree_1 = require("./bree");
// import { telegramBotListener } from './services/telegram-bot';
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const v1_1 = __importDefault(require("./routes/v1"));
const port = process.env.PORT || 8000;
// cors
app_1.default.use((0, cors_1.default)({ origin: [
        'http://localhost:3000',
        "https://v5wgzfbw-3000.uks1.devtunnels.ms"
    ], credentials: true, }));
// Middleware
app_1.default.use(express_1.default.json());
app_1.default.use(express_1.default.urlencoded({ extended: true, }));
const server = http_1.default.createServer(app_1.default);
// ip lookup
app_1.default.set('trust proxy', true);
// set proper headers
app_1.default.use((0, helmet_1.default)());
// cookies
app_1.default.use((0, cookie_parser_1.default)());
// initialize socket.io
(0, socketIo_1.default)(server);
// initialize telegram bot
// telegramBotListener()
// start breeJob
(0, bree_1.startBreeJob)();
// Routes
app_1.default.get('/', (req, res) => {
    res.send('Hello, server is up & running!');
});
app_1.default.use("/api/v1/", v1_1.default);
server.listen(port, () => {
    console.log(`listening on port: ${port}`);
});

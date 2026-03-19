"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockAuthMiddleware = mockAuthMiddleware;
const db_1 = __importDefault(require("../db"));
const getUser = db_1.default.prepare('SELECT * FROM users WHERE id = ?');
function mockAuthMiddleware(req, res, next) {
    const userId = req.headers['x-mock-user-id'];
    if (!userId || typeof userId !== 'string') {
        res.status(401).json({ error: 'Unauthorized: X-Mock-User-Id header is required' });
        return;
    }
    const user = getUser.get(userId);
    if (!user) {
        res.status(401).json({ error: 'Unauthorized: user not found' });
        return;
    }
    req.user = user;
    next();
}

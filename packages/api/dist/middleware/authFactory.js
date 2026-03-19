"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockAuthMiddlewareWithDb = mockAuthMiddlewareWithDb;
/**
 * Creates a mock auth middleware bound to a specific DB instance.
 * Used in tests to inject an in-memory database.
 */
function mockAuthMiddlewareWithDb(db) {
    const getUser = db.prepare('SELECT * FROM users WHERE id = ?');
    return function authMiddleware(req, res, next) {
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
    };
}

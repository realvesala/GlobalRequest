"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
/**
 * Middleware factory that restricts access to users with one of the specified roles.
 * Returns 403 if the authenticated user's role is not in the allowed list.
 */
function requireRole(...roles) {
    return function (req, res, next) {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Forbidden: insufficient role' });
            return;
        }
        next();
    };
}

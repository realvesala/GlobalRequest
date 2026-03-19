import { Request, Response, NextFunction } from 'express';

/**
 * Middleware factory that restricts access to users with one of the specified roles.
 * Returns 403 if the authenticated user's role is not in the allowed list.
 */
export function requireRole(...roles: string[]) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: insufficient role' });
      return;
    }
    next();
  };
}

import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';

/**
 * Creates a mock auth middleware bound to a specific DB instance.
 * Used in tests to inject an in-memory database.
 */
export function mockAuthMiddlewareWithDb(db: Database.Database) {
  const getUser = db.prepare<string>('SELECT * FROM users WHERE id = ?');

  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const userId = req.headers['x-mock-user-id'];

    if (!userId || typeof userId !== 'string') {
      res.status(401).json({ error: 'Unauthorized: X-Mock-User-Id header is required' });
      return;
    }

    const user = getUser.get(userId) as
      | {
          id: string;
          sso_subject: string;
          email: string;
          display_name: string;
          role: string;
          region: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized: user not found' });
      return;
    }

    req.user = user;
    next();
  };
}

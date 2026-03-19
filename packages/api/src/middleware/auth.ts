import { Request, Response, NextFunction } from 'express';
import db from '../db';

interface User {
  id: string;
  sso_subject: string;
  email: string;
  display_name: string;
  role: string;
  region: string | null;
  created_at: string;
  updated_at: string;
}

// Extend Express Request to include the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const getUser = db.prepare<string>('SELECT * FROM users WHERE id = ?');

export function mockAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const userId = req.headers['x-mock-user-id'];

  if (!userId || typeof userId !== 'string') {
    res.status(401).json({ error: 'Unauthorized: X-Mock-User-Id header is required' });
    return;
  }

  const user = getUser.get(userId) as User | undefined;

  if (!user) {
    res.status(401).json({ error: 'Unauthorized: user not found' });
    return;
  }

  req.user = user;
  next();
}

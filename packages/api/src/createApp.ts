import express, { Express, Router } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { mockAuthMiddlewareWithDb } from './middleware/authFactory';
import { createAdminRouter } from './routes/admin';
import { createRequestsRouter } from './routes/requests';
import { runMigrationsOn } from './migrate';

/**
 * Creates an Express app wired to the given SQLite database instance.
 * Used by tests to inject an in-memory DB.
 */
export function createApp(db: Database.Database): Express {
  const app = express();

  // Ensure schema exists on the provided DB (idempotent — uses CREATE TABLE IF NOT EXISTS)
  runMigrationsOn(db);

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Auth middleware using the provided db
  const authMiddleware = mockAuthMiddlewareWithDb(db);
  app.use(authMiddleware);

  // Auth routes
  const authRouter = Router();
  authRouter.get('/me', (req, res) => {
    const { id, email, display_name, role, region } = req.user!;
    res.json({ id, email, display_name, role, region });
  });
  app.use('/auth', authRouter);

  // Admin routes — Admin only (labs, methods, users stubs)
  const adminRouter = createAdminRouter(db);
  // Users stubs (managed by a future task)
  adminRouter.get('/users', (_req, res) => res.json({ users: [] }));
  adminRouter.put('/users/:id/role', (_req, res) => res.json({ updated: true }));
  app.use('/admin', adminRouter);

  // Requests routes
  const requestsRouter = createRequestsRouter(db);
  app.use('/requests', requestsRouter);

  return app;
}

import express from 'express';
import cors from 'cors';
import { runMigrations } from './migrate';
import { mockAuthMiddleware } from './middleware/auth';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import db from './db';
import { createAdminRouter } from './routes/admin';
import { createRequestsRouter } from './routes/requests';
import { createNotificationsRouter } from './routes/notifications';

// Run migrations on startup
runMigrations();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check and users list are public — no auth required
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/users', usersRouter);

// All routes below require mock auth
app.use(mockAuthMiddleware);

app.use('/auth', authRouter);
app.use('/admin', createAdminRouter(db));
app.use('/requests', createRequestsRouter(db));
app.use('/notifications', createNotificationsRouter(db));

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

export default app;

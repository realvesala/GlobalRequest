import { Router } from 'express';
import db from '../db';

const router = Router();

// Public endpoint — lists demo users for the role-switcher UI
router.get('/', (_req, res) => {
  const users = db
    .prepare('SELECT id, display_name, role, region FROM users ORDER BY created_at ASC')
    .all();
  res.json(users);
});

export default router;

import { Router } from 'express';

const router = Router();

router.get('/me', (req, res) => {
  const { id, email, display_name, role, region } = req.user!;
  res.json({ id, email, display_name, role, region });
});

export default router;

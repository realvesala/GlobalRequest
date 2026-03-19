import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { requireRole } from '../middleware/requireRole';

export function createAdminRouter(db: Database.Database): Router {
  const router = Router();

  // Methods read access is public so Requestors can create new submissions.
  router.get('/methods', (_req, res) => {
    const methods = db.prepare('SELECT * FROM methods ORDER BY created_at DESC').all();
    res.json({ methods });
  });

  // Labs and method modifications require Admin role
  router.use(requireRole('Admin'));

  // ── Labs ──────────────────────────────────────────────────────────────────

  router.get('/labs', (_req, res) => {
    const labs = db.prepare('SELECT * FROM labs ORDER BY created_at DESC').all();
    const getMethods = db.prepare(
      `SELECT m.* FROM methods m
       JOIN lab_methods lm ON lm.method_id = m.id
       WHERE lm.lab_id = ?`
    );
    const result = labs.map((lab: any) => ({
      ...lab,
      methods: getMethods.all(lab.id),
    }));
    res.json({ labs: result });
  });

  router.post('/labs', (req, res) => {
    const { name, region, contact_info, method_ids } = req.body as {
      name?: string;
      region?: string;
      contact_info?: string;
      method_ids?: string[];
    };

    if (!name || !region) {
      res.status(422).json({ error: 'name and region are required' });
      return;
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO labs (id, name, region, contact_info, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    ).run(id, name, region, contact_info ?? null, now, now);

    if (Array.isArray(method_ids) && method_ids.length > 0) {
      const insertLm = db.prepare(
        'INSERT OR IGNORE INTO lab_methods (lab_id, method_id) VALUES (?, ?)'
      );
      for (const mid of method_ids) {
        insertLm.run(id, mid);
      }
    }

    const lab = db.prepare('SELECT * FROM labs WHERE id = ?').get(id);
    res.status(201).json(lab);
  });

  router.put('/labs/:id', (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM labs WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Lab not found' });
      return;
    }

    const { name, region, contact_info, method_ids } = req.body as {
      name?: string;
      region?: string;
      contact_info?: string;
      method_ids?: string[];
    };

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE labs SET
        name = ?, region = ?, contact_info = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      name ?? existing.name,
      region ?? existing.region,
      contact_info !== undefined ? contact_info : existing.contact_info,
      now,
      id
    );

    if (Array.isArray(method_ids)) {
      db.prepare('DELETE FROM lab_methods WHERE lab_id = ?').run(id);
      const insertLm = db.prepare(
        'INSERT OR IGNORE INTO lab_methods (lab_id, method_id) VALUES (?, ?)'
      );
      for (const mid of method_ids) {
        insertLm.run(id, mid);
      }
    }

    const updated = db.prepare('SELECT * FROM labs WHERE id = ?').get(id);
    res.json(updated);
  });

  router.delete('/labs/:id', (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM labs WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Lab not found' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE labs SET is_active = 0, updated_at = ? WHERE id = ?').run(now, id);
    res.json({ deactivated: true });
  });

  // ── Methods ───────────────────────────────────────────────────────────────

  router.post('/methods', (req, res) => {
    const { name, description, required_material } = req.body as {
      name?: string;
      description?: string;
      required_material?: string;
    };

    if (!name) {
      res.status(422).json({ error: 'name is required' });
      return;
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO methods (id, name, description, required_material, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    ).run(id, name, description ?? null, required_material ?? null, now, now);

    const method = db.prepare('SELECT * FROM methods WHERE id = ?').get(id);
    res.status(201).json(method);
  });

  router.put('/methods/:id', (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM methods WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Method not found' });
      return;
    }

    const { name, description, required_material } = req.body as {
      name?: string;
      description?: string;
      required_material?: string;
    };

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE methods SET
        name = ?, description = ?, required_material = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      name ?? existing.name,
      description !== undefined ? description : existing.description,
      required_material !== undefined ? required_material : existing.required_material,
      now,
      id
    );

    const updated = db.prepare('SELECT * FROM methods WHERE id = ?').get(id);
    res.json(updated);
  });

  router.delete('/methods/:id', (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM methods WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Method not found' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE methods SET is_active = 0, updated_at = ? WHERE id = ?').run(now, id);
    res.json({ deactivated: true });
  });

  return router;
}

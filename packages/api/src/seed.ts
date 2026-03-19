import { v4 as uuidv4 } from 'uuid';
import db from './db';
import { runMigrations } from './migrate';

function seed(): void {
  runMigrations();

  const now = new Date().toISOString();

  // Check if already seeded
  const existing = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existing.count > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  // --- Users ---
  const users = [
    {
      id: uuidv4(),
      sso_subject: 'demo-requestor',
      email: 'requestor@demo.local',
      display_name: 'Alice Requestor',
      role: 'Requestor',
      region: 'EMEA',
    },
    {
      id: uuidv4(),
      sso_subject: 'demo-technician',
      email: 'technician@demo.local',
      display_name: 'Bob Technician',
      role: 'Lab_Technician',
      region: 'EMEA',
    },
    {
      id: uuidv4(),
      sso_subject: 'demo-manager',
      email: 'manager@demo.local',
      display_name: 'Carol Manager',
      role: 'Lab_Manager',
      region: 'EMEA',
    },
    {
      id: uuidv4(),
      sso_subject: 'demo-admin',
      email: 'admin@demo.local',
      display_name: 'Dave Admin',
      role: 'Admin',
      region: 'AMER',
    },
  ];

  const insertUser = db.prepare(
    `INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (@id, @sso_subject, @email, @display_name, @role, @region, @created_at, @updated_at)`
  );

  for (const u of users) {
    insertUser.run({ ...u, created_at: now, updated_at: now });
  }

  // --- Methods ---
  const methods = [
    {
      id: uuidv4(),
      name: 'Tensile Strength Test',
      description: 'Measures the maximum stress a material can withstand while being stretched.',
      required_material: 'Metal sample (min 10cm)',
    },
    {
      id: uuidv4(),
      name: 'Chemical Composition Analysis',
      description: 'Determines the elemental composition of a material sample.',
      required_material: 'Any solid or liquid sample (5g min)',
    },
    {
      id: uuidv4(),
      name: 'Thermal Conductivity Measurement',
      description: 'Measures how well a material conducts heat.',
      required_material: 'Flat sample (50mm x 50mm)',
    },
  ];

  const insertMethod = db.prepare(
    `INSERT INTO methods (id, name, description, required_material, is_active, created_at, updated_at)
     VALUES (@id, @name, @description, @required_material, 1, @created_at, @updated_at)`
  );

  for (const m of methods) {
    insertMethod.run({ ...m, created_at: now, updated_at: now });
  }

  // --- Labs ---
  const labs = [
    {
      id: uuidv4(),
      name: 'EMEA Central Lab',
      region: 'EMEA',
      contact_info: JSON.stringify({ email: 'emea-lab@demo.local', phone: '+49-30-12345' }),
    },
    {
      id: uuidv4(),
      name: 'AMER West Lab',
      region: 'AMER',
      contact_info: JSON.stringify({ email: 'amer-lab@demo.local', phone: '+1-415-55500' }),
    },
  ];

  const insertLab = db.prepare(
    `INSERT INTO labs (id, name, region, contact_info, is_active, created_at, updated_at)
     VALUES (@id, @name, @region, @contact_info, 1, @created_at, @updated_at)`
  );

  for (const l of labs) {
    insertLab.run({ ...l, created_at: now, updated_at: now });
  }

  // --- Lab Methods associations ---
  // EMEA lab supports all 3 methods; AMER lab supports methods 1 and 2
  const insertLabMethod = db.prepare(
    `INSERT INTO lab_methods (lab_id, method_id) VALUES (@lab_id, @method_id)`
  );

  const emeaLab = labs[0];
  const amerLab = labs[1];

  for (const m of methods) {
    insertLabMethod.run({ lab_id: emeaLab.id, method_id: m.id });
  }
  insertLabMethod.run({ lab_id: amerLab.id, method_id: methods[0].id });
  insertLabMethod.run({ lab_id: amerLab.id, method_id: methods[1].id });

  console.log('Seed complete.');
  console.log('\nDemo users:');
  for (const u of users) {
    console.log(`  ${u.role.padEnd(16)} id=${u.id}  (${u.display_name})`);
  }
}

seed();

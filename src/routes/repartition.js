import { Router } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../db/init.js';
import { authMiddleware, requireManager, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/configs', async (req, res) => {
  try {
    const configs = await pool.query('SELECT * FROM repartition_configs WHERE active = true ORDER BY nom');
    for (const c of configs.rows) {
      const soignants = await pool.query('SELECT * FROM repartition_soignants WHERE config_id = $1 ORDER BY ordre', [c.id]);
      c.soignants = soignants.rows;
    }
    res.json(configs.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/configs/:id', async (req, res) => {
  try {
    const config = await pool.query('SELECT * FROM repartition_configs WHERE id = $1', [req.params.id]);
    if (!config.rows[0]) return res.status(404).json({ error: 'Config introuvable' });
    const soignants = await pool.query('SELECT * FROM repartition_soignants WHERE config_id = $1 ORDER BY ordre', [req.params.id]);
    for (const s of soignants.rows) {
      const defaults = await pool.query('SELECT chambre FROM repartition_defaults WHERE soignant_id = $1 ORDER BY chambre', [s.id]);
      s.chambres_default = defaults.rows.map(r => r.chambre);
    }
    res.json({ ...config.rows[0], soignants: soignants.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/configs', requireManager, async (req, res) => {
  const { nom, soignants } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  try {
    const configId = randomUUID();
    await pool.query('INSERT INTO repartition_configs (id, nom) VALUES ($1,$2)', [configId, nom]);
    if (soignants && Array.isArray(soignants)) {
      let ordre = 0;
      for (const s of soignants) {
        const sid = randomUUID();
        await pool.query('INSERT INTO repartition_soignants (id, config_id, numero, label, etage, ordre) VALUES ($1,$2,$3,$4,$5,$6)',
          [sid, configId, s.numero, s.label, s.etage || null, ordre++]);
        if (s.chambres_default && s.chambres_default.length > 0) {
          for (const chambre of s.chambres_default) {
            await pool.query('INSERT INTO repartition_defaults (id, config_id, soignant_id, chambre) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
              [randomUUID(), configId, sid, chambre]);
          }
        }
      }
    }
    res.status(201).json({ id: configId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/configs/:id', requireManager, async (req, res) => {
  const { nom, soignants } = req.body;
  try {
    if (nom) await pool.query('UPDATE repartition_configs SET nom = $1 WHERE id = $2', [nom, req.params.id]);
    if (soignants && Array.isArray(soignants)) {
      await pool.query('DELETE FROM repartition_soignants WHERE config_id = $1', [req.params.id]);
      let ordre = 0;
      for (const s of soignants) {
        const sid = randomUUID();
        await pool.query('INSERT INTO repartition_soignants (id, config_id, numero, label, etage, ordre) VALUES ($1,$2,$3,$4,$5,$6)',
          [sid, req.params.id, s.numero, s.label, s.etage || null, ordre++]);
        if (s.chambres_default && s.chambres_default.length > 0) {
          for (const chambre of s.chambres_default) {
            await pool.query('INSERT INTO repartition_defaults (id, config_id, soignant_id, chambre) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
              [randomUUID(), req.params.id, sid, chambre]);
          }
        }
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/configs/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE repartition_configs SET active = false WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/affectations', async (req, res) => {
  const { config_id, date } = req.query;
  if (!config_id || !date) return res.status(400).json({ error: 'config_id et date requis' });
  try {
    const result = await pool.query(`
      SELECT a.*, r.nom, r.prenom, r.chambre, r.toilette, r.transfert,
             s.label as soignant_label, s.numero as soignant_numero,
             b.label as binome_label
      FROM repartition_affectations a
      JOIN residents r ON a.resident_id = r.id
      JOIN repartition_soignants s ON a.soignant_id = s.id
      LEFT JOIN repartition_soignants b ON a.binome_soignant_id = b.id
      WHERE a.config_id = $1 AND a.date_affectation = $2
      ORDER BY s.ordre, r.chambre
    `, [config_id, date]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/affectations/init', requireManager, async (req, res) => {
  const { config_id, date } = req.body;
  if (!config_id || !date) return res.status(400).json({ error: 'config_id et date requis' });
  try {
    const existing = await pool.query('SELECT COUNT(*) as c FROM repartition_affectations WHERE config_id = $1 AND date_affectation = $2', [config_id, date]);
    if (parseInt(existing.rows[0].c) > 0) return res.json({ message: 'Deja initialisee' });
    const soignants = await pool.query('SELECT s.*, rd.chambre FROM repartition_soignants s LEFT JOIN repartition_defaults rd ON rd.soignant_id = s.id WHERE s.config_id = $1', [config_id]);
    const defaultsBySoignant = {};
    for (const row of soignants.rows) {
      if (!defaultsBySoignant[row.id]) defaultsBySoignant[row.id] = { soignant: row, chambres: [] };
      if (row.chambre) defaultsBySoignant[row.id].chambres.push(row.chambre);
    }
    for (const [sid, { chambres }] of Object.entries(defaultsBySoignant)) {
      for (const chambre of chambres) {
        const resident = await pool.query('SELECT id FROM residents WHERE chambre = $1 AND archive = false', [chambre]);
        if (resident.rows[0]) {
          await pool.query(
            'INSERT INTO repartition_affectations (id, config_id, soignant_id, resident_id, date_affectation) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (resident_id, date_affectation) DO NOTHING',
            [randomUUID(), config_id, sid, resident.rows[0].id, date]
          );
        }
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/affectations/:residentId', requireManager, async (req, res) => {
  const { config_id, date, soignant_id, binome_soignant_id } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM repartition_affectations WHERE resident_id = $1 AND date_affectation = $2', [req.params.residentId, date]);
    if (existing.rows.length > 0) {
      await pool.query('UPDATE repartition_affectations SET soignant_id = $1, binome_soignant_id = $2 WHERE id = $3',
        [soignant_id, binome_soignant_id || null, existing.rows[0].id]);
    } else {
      await pool.query('INSERT INTO repartition_affectations (id, config_id, soignant_id, resident_id, date_affectation, binome_soignant_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [randomUUID(), config_id, soignant_id, req.params.residentId, date, binome_soignant_id || null]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/non-affectes', async (req, res) => {
  const { config_id, date } = req.query;
  try {
    const result = await pool.query(`
      SELECT r.id, r.nom, r.prenom, r.chambre, r.toilette
      FROM residents r
      WHERE r.archive = false
        AND r.id NOT IN (
          SELECT resident_id FROM repartition_affectations
          WHERE config_id = $1 AND date_affectation = $2
        )
      ORDER BY r.chambre
    `, [config_id, date]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;

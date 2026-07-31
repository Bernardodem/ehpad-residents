import { Router } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../db/init.js';
import { authMiddleware, requireManager, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// Champs modifiables (mapping API -> colonne SQL)
const FIELDS = {
  chambre: 'chambre', nom: 'nom', prenom: 'prenom',
  toilette: 'toilette', transfert: 'transfert',
  bas_contention: 'bas_contention', bandes_contention: 'bandes_contention',
  prot_m: 'prot_m', prot_am: 'prot_am', prot_s: 'prot_s', prot_n: 'prot_n',
  prot_taille: 'prot_taille', mae: 'mae',
  prot_dent: 'prot_dent', prot_aud: 'prot_aud', lunettes: 'lunettes',
  texture: 'texture', partic_rep: 'partic_rep',
  lieu_pd: 'lieu_pd', lieu_dj: 'lieu_dj', lieu_d: 'lieu_d',
  hydratation: 'hydratation', aide_repas: 'aide_repas', allergie: 'allergie',
  deplacement: 'deplacement', mode_depl: 'mode_depl', install_sieste: 'install_sieste',
  partic_soins: 'partic_soins', poids: 'poids',
  prot_jur_type: 'prot_jur_type',
  prot_jur_tuteur_nom: 'prot_jur_tuteur_nom',
  prot_jur_tuteur_tel: 'prot_jur_tuteur_tel',
  prot_jur_tuteur_email: 'prot_jur_tuteur_email',
  prot_jur_date_debut: 'prot_jur_date_debut',
  prot_jur_date_fin: 'prot_jur_date_fin'
};
const ARRAY_FIELDS = ['regimes', 'cno', 'pdj', 'risques'];
const JSON_FIELDS = ['contentions'];
const DATE_FIELDS = ['prot_jur_date_debut', 'prot_jur_date_fin', 'archive_date'];

// Liste
router.get('/', async (req, res) => {
  const { archive, search } = req.query;
  try {
    const conditions = [];
    const params = [];
    conditions.push(`archive = $${params.length + 1}`);
    params.push(archive === 'true');
    if (search) {
      conditions.push(`(nom ILIKE $${params.length + 1} OR prenom ILIKE $${params.length + 1} OR chambre::text LIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }
    const result = await pool.query(
      `SELECT * FROM residents WHERE ${conditions.join(' AND ')} ORDER BY chambre`,
      params
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Detail
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM residents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Resident introuvable' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Creation
router.post('/', requireManager, async (req, res) => {
  const { chambre, nom, prenom } = req.body;
  if (!chambre || !nom || !prenom) {
    return res.status(400).json({ error: 'Chambre, nom et prenom requis' });
  }
  try {
    const dup = await pool.query('SELECT id FROM residents WHERE chambre = $1 AND archive = false', [chambre]);
    if (dup.rows.length > 0) return res.status(409).json({ error: 'Cette chambre est deja occupee' });

    const id = randomUUID();
    await pool.query(
      'INSERT INTO residents (id, chambre, nom, prenom, updated_by) VALUES ($1,$2,$3,$4,$5)',
      [id, chambre, nom.toUpperCase(), prenom, req.user.id]
    );
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mise a jour
router.patch('/:id', requireManager, async (req, res) => {
  try {
    const updates = [];
    const params = [];

    for (const [key, col] of Object.entries(FIELDS)) {
      if (req.body[key] === undefined) continue;
      let val = req.body[key];
      if (val === '' && DATE_FIELDS.includes(col)) val = null;
      updates.push(`${col} = $${params.length + 1}`);
      params.push(val);
    }
    for (const f of ARRAY_FIELDS) {
      if (req.body[f] === undefined) continue;
      updates.push(`${f} = $${params.length + 1}`);
      params.push(req.body[f] || []);
    }
    for (const f of JSON_FIELDS) {
      if (req.body[f] === undefined) continue;
      updates.push(`${f} = $${params.length + 1}`);
      params.push(JSON.stringify(req.body[f] || {}));
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Aucune donnee a mettre a jour' });

    updates.push(`updated_at = NOW()`);
    updates.push(`updated_by = $${params.length + 1}`);
    params.push(req.user.id);
    params.push(req.params.id);

    await pool.query(
      `UPDATE residents SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Archivage
router.post('/:id/archiver', requireManager, async (req, res) => {
  try {
    await pool.query(
      `UPDATE residents SET archive = true, archive_date = CURRENT_DATE, updated_at = NOW(), updated_by = $1 WHERE id = $2`,
      [req.user.id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/desarchiver', requireManager, async (req, res) => {
  try {
    await pool.query(
      `UPDATE residents SET archive = false, archive_date = NULL, updated_at = NOW(), updated_by = $1 WHERE id = $2`,
      [req.user.id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Suppression definitive (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM residents WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/chambres/disponibles', async (req, res) => {
  try {
    const occupees = await pool.query('SELECT chambre FROM residents WHERE archive = false ORDER BY chambre');
    const occupeesSet = new Set(occupees.rows.map(r => r.chambre));
    const toutes = [];
    for (let i = 100; i <= 512; i++) {
      const centaine = Math.floor(i / 100);
      const unite = i % 100;
      if (centaine >= 1 && centaine <= 5 && unite >= 1 && unite <= 12) {
        toutes.push({ chambre: i, libre: !occupeesSet.has(i) });
      }
    }
    res.json(toutes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;

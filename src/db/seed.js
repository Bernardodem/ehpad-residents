import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { pool, initDb } from './init.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seed() {
  await initDb();

  const existing = await pool.query('SELECT COUNT(*) as c FROM residents');
  if (parseInt(existing.rows[0].c) > 0) {
    console.log('Des residents existent deja, seed ignore. Utilisez --force pour ecraser.');
    if (!process.argv.includes('--force')) {
      await pool.end();
      return;
    }
    await pool.query('DELETE FROM residents');
    console.log('Table videe (--force)');
  }

  const raw = JSON.parse(readFileSync(path.join(__dirname, 'residents-seed.json'), 'utf8'));

  let count = 0;
  for (const r of raw) {
    await pool.query(`
      INSERT INTO residents (
        id, chambre, nom, prenom, archive, archive_date,
        toilette, transfert, bas_contention, bandes_contention, contentions,
        prot_m, prot_am, prot_s, prot_n, mae, prot_dent, prot_aud, lunettes,
        texture, regimes, partic_rep, lieu_pd, lieu_dj, lieu_d, cno, pdj, hydratation,
        deplacement, partic_soins, poids
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,$27,$28,
        $29,$30,$31
      )
    `, [
      randomUUID(), r.id, r.nom, r.prenom, !!r.archive, r.archiveDate || null,
      r.toilette || null, r.transfert || null, r.basContention || null, r.bandesContention || null,
      JSON.stringify(r.contentions || {}),
      r.protM || null, r.protAM || null, r.protS || null, r.protN || null,
      !!r.mae, r.protDent || null, r.protAud || null, !!r.lunettes,
      r.texture || null, r.regimes || [], r.particRep || null,
      r.lieuPD || null, r.lieuDJ || null, r.lieuD || null,
      r.cno || [], r.pdj || [], r.hydratation || null,
      r.deplacement || null, r.particSoins || null, r.poids || null
    ]);
    count++;
  }

  console.log(`${count} residents importes.`);
  await pool.end();
}

seed().catch(err => { console.error('Erreur seed:', err); process.exit(1); });

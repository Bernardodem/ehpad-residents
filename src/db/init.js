import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS residents (
      id TEXT PRIMARY KEY,
      chambre INTEGER NOT NULL,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      archive BOOLEAN DEFAULT false,
      archive_date DATE,

      -- Nursing
      toilette TEXT,
      transfert TEXT,
      bas_contention TEXT,
      bandes_contention TEXT,
      contentions JSONB DEFAULT '{}'::jsonb,
      prot_m TEXT,
      prot_am TEXT,
      prot_s TEXT,
      prot_n TEXT,
      prot_taille TEXT,
      mae BOOLEAN DEFAULT false,
      prot_dent TEXT,
      prot_aud TEXT,
      lunettes BOOLEAN DEFAULT false,

      -- Alimentation
      texture TEXT,
      regimes TEXT[] DEFAULT '{}',
      partic_rep TEXT,
      lieu_pd TEXT,
      lieu_dj TEXT,
      lieu_d TEXT,
      cno TEXT[] DEFAULT '{}',
      pdj TEXT[] DEFAULT '{}',
      hydratation TEXT,
      aide_repas TEXT,
      allergie TEXT,

      -- Deplacements
      deplacement TEXT,
      mode_depl TEXT,
      install_sieste TEXT,

      -- Risques
      risques TEXT[] DEFAULT '{}',

      -- Particularites
      partic_soins TEXT,
      poids TEXT,

      -- Protection juridique
      prot_jur_type TEXT DEFAULT 'Aucune',
      prot_jur_tuteur_nom TEXT,
      prot_jur_tuteur_tel TEXT,
      prot_jur_tuteur_email TEXT,
      prot_jur_date_debut DATE,
      prot_jur_date_fin DATE,

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      updated_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_residents_chambre ON residents(chambre);
    CREATE INDEX IF NOT EXISTS idx_residents_archive ON residents(archive);
  `);

  console.log('Residents — Base de donnees initialisee');
}

import express from 'express';
import cors from 'cors';
import { initDb } from './db/init.js';
import residentsRoutes from './routes/residents.js';

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

app.use('/api/residents', residentsRoutes);
app.get('/api/health', (_, res) => res.json({ status: 'ok', service: 'Residents' }));

initDb().then(() => {
  app.listen(PORT, () => console.log(`Residents demarre sur le port ${PORT}`));
}).catch(err => {
  console.error('Erreur init DB:', err);
  process.exit(1);
});

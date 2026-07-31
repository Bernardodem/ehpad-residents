import jwt from 'jsonwebtoken';

const SSO_SECRET = process.env.SSO_JWT_SECRET || 'SsoSecretMonArcEnCiel2024';
const RESIDENTS_APP_ID = process.env.RESIDENTS_APP_ID;

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    req.user = jwt.verify(header.slice(7), SSO_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }
}

function appRole(user) {
  if (['admin_groupe', 'admin_etablissement'].includes(user.role_global)) return 'admin';
  const app = (user.apps || []).find(a => a.id === RESIDENTS_APP_ID);
  return app ? app.role : null;
}

export function requireManager(req, res, next) {
  const role = appRole(req.user);
  if (role && ['gestionnaire', 'admin'].includes(role)) return next();
  return res.status(403).json({ error: 'Acces gestionnaire requis' });
}

export function requireAdmin(req, res, next) {
  if (appRole(req.user) === 'admin') return next();
  return res.status(403).json({ error: 'Acces administrateur requis' });
}

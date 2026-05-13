import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getOne, run } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getSettings } from '../services/settings.js';

const router = Router();

// JWT_SECRET validated in middleware/auth.ts at startup — read directly here
const JWT_SECRET   = process.env.JWT_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL || '';

// Helper: OIDC base path for a given KC root URL
const kcOidc = (base: string, realm: string) =>
  `${base}/realms/${realm}/protocol/openid-connect`;

// ── Email/password login ───────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email y contraseña son requeridos' });
    return;
  }

  const user = await getOne('SELECT * FROM usuarios WHERE email = $1', [email]);

  if (!user) {
    res.status(401).json({ error: 'Credenciales inválidas' });
    return;
  }

  if (!user.password_hash) {
    res.status(401).json({ error: 'Esta cuenta fue creada con Google. Usa "Iniciar sesión con Google".' });
    return;
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    res.status(401).json({ error: 'Credenciales inválidas' });
    return;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
    },
  });
});

// ── Current user ───────────────────────────────────────────────────────────
router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

// ── Register ───────────────────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
  const { nombre, email, password, rol } = req.body;

  if (!nombre || !email || !password) {
    res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
    return;
  }

  const existing = await getOne('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (existing) {
    res.status(409).json({ error: 'El email ya está registrado' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = await getOne(
    'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id',
    [nombre, email, hash, rol || 'viewer']
  );

  res.status(201).json({
    id: result.id,
    nombre,
    email,
    rol: rol || 'viewer',
  });
});

// ── Auth providers — public endpoint for login page ───────────────────────
router.get('/providers', async (_req: Request, res: Response) => {
  try {
    const s = await getSettings();
    // Show button whenever admin explicitly enabled the provider.
    // If config is incomplete the user will see an error on click — better than
    // silently hiding a button the admin intentionally activated.
    res.json({
      google:   s.google_enabled,
      keycloak: s.keycloak_enabled,
    });
  } catch {
    res.json({ google: false, keycloak: false });
  }
});

// ── Google OAuth ───────────────────────────────────────────────────────────

router.get('/google', async (req: Request, res: Response) => {
  const s = await getSettings();
  if (!s.google_enabled || !s.google_client_id) {
    res.redirect(`${FRONTEND_URL}/login?error=google_not_configured`);
    return;
  }
  const params = new URLSearchParams({
    client_id:     s.google_client_id,
    redirect_uri:  s.google_callback_url,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query;
  if (error || !code) { res.redirect(`${FRONTEND_URL}/login?error=google_cancelled`); return; }
  try {
    const s = await getSettings();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code:          code as string,
        client_id:     s.google_client_id,
        client_secret: s.google_client_secret,
        redirect_uri:  s.google_callback_url,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json() as Record<string, any>;
    if (!tokenData.access_token) throw new Error('No access_token from Google');

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const { sub: googleId, email, name } = await userInfoRes.json() as Record<string, any>;
    if (!email) throw new Error('Google no devolvió email');

    let user = await getOne('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (!user) {
      user = await getOne(
        `INSERT INTO usuarios (nombre, email, password_hash, rol, google_id)
         VALUES ($1, $2, NULL, 'viewer', $3) RETURNING id, nombre, email, rol`,
        [name || email, email, googleId]
      );
    } else if (!user.google_id) {
      await run('UPDATE usuarios SET google_id = $1 WHERE id = $2', [googleId, user.id]);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('[Google OAuth]', err);
    res.redirect(`${FRONTEND_URL}/login?error=google_failed`);
  }
});

// ── Keycloak OIDC ──────────────────────────────────────────────────────────

router.get('/keycloak', async (req: Request, res: Response) => {
  const s = await getSettings();
  if (!s.keycloak_enabled || !s.keycloak_url || !s.keycloak_realm) {
    res.redirect(`${FRONTEND_URL}/login?error=keycloak_not_configured`);
    return;
  }
  const params = new URLSearchParams({
    client_id:     s.keycloak_client_id,
    redirect_uri:  s.keycloak_callback_url,
    response_type: 'code',
    scope:         'openid email profile',
  });
  res.redirect(`${kcOidc(s.keycloak_public_url || s.keycloak_url, s.keycloak_realm)}/auth?${params}`);
});

router.get('/keycloak/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query;
  if (error || !code) { res.redirect(`${FRONTEND_URL}/login?error=keycloak_cancelled`); return; }
  try {
    const s = await getSettings();
    const tokenRes = await fetch(
      `${kcOidc(s.keycloak_url, s.keycloak_realm)}/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code:          code as string,
          client_id:     s.keycloak_client_id,
          client_secret: s.keycloak_client_secret,
          redirect_uri:  s.keycloak_callback_url,
          grant_type:    'authorization_code',
        }),
      }
    );
    const tokenData = await tokenRes.json() as Record<string, any>;
    if (!tokenData.access_token)
      throw new Error(`No access_token from Keycloak: ${JSON.stringify(tokenData)}`);

    const userInfoRes = await fetch(
      `${kcOidc(s.keycloak_url, s.keycloak_realm)}/userinfo`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const { email, name, preferred_username } = await userInfoRes.json() as Record<string, any>;
    if (!email) throw new Error('Keycloak no devolvió email');

    let user = await getOne('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (!user) {
      user = await getOne(
        `INSERT INTO usuarios (nombre, email, password_hash, rol)
         VALUES ($1, $2, NULL, 'viewer') RETURNING id, nombre, email, rol`,
        [name || preferred_username || email, email]
      );
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('[Keycloak OIDC]', err);
    res.redirect(`${FRONTEND_URL}/login?error=keycloak_failed`);
  }
});

export default router;

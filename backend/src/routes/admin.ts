import { Router, Response } from 'express';
import { run } from '../db/database.js';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import { getSettings, maskSettings, MASK, SENSITIVE, AppSettings } from '../services/settings.js';

const router = Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

// ── GET /api/admin/settings ────────────────────────────────────────────────
router.get('/settings', async (_req: AuthRequest, res: Response) => {
  try {
    const s = await getSettings();
    res.json(maskSettings(s));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/admin/settings ────────────────────────────────────────────────
router.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const current = await getSettings();
    const body = req.body as Partial<AppSettings & Record<string, unknown>>;
    
    const isEmpty = (value: any) => value === "" || value === null || value === undefined;
    // Merge: skip masked sensitive fields (keep existing), accept everything else
    const merged: Record<string, unknown> = { ...current };
    for (const [key, val] of Object.entries(body)) {      
      if (SENSITIVE.includes(key)) {
        if (val === MASK || isEmpty(val)) continue;
      }

      if (isEmpty(val)) continue;
      merged[key] = val;
    }

    await run(
      `INSERT INTO app_settings (id, settings, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET settings = $1, updated_at = NOW()`,
      [JSON.stringify(merged)]
    );

    res.json(maskSettings(merged as unknown as AppSettings));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

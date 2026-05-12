/**
 * Settings service — merges app_settings DB row with env-var defaults.
 * Exported getSettings() is called from auth.ts and admin.ts so both
 * always use the live values (no module-level caching).
 */
import { getOne } from '../db/database.js';

export const MASK = '••••••••';
export const SENSITIVE = [
  'google_client_secret',
  'keycloak_client_secret',
  'smtp_pass',
];

export interface AppSettings {
  // Google OAuth
  google_enabled: boolean;
  google_client_id: string;
  google_client_secret: string;
  google_callback_url: string;
  // Keycloak SSO
  keycloak_enabled: boolean;
  keycloak_url: string;
  keycloak_public_url: string;
  keycloak_realm: string;
  keycloak_client_id: string;
  keycloak_client_secret: string;
  keycloak_callback_url: string;
  // SMTP Email
  smtp_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
}

/** Returns live settings merged: DB overrides > env vars */
export async function getSettings(): Promise<AppSettings> {
  const row = await getOne(
    'SELECT settings FROM app_settings WHERE id = 1'
  );
  const typedRow = row as { settings: Partial<AppSettings> } | null;
  const db = typedRow?.settings ?? {};

  return {
    // Google
    google_enabled:
      db.google_enabled ??
      !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    google_client_id:     db.google_client_id     ?? process.env.GOOGLE_CLIENT_ID     ?? '',
    google_client_secret: db.google_client_secret ?? process.env.GOOGLE_CLIENT_SECRET ?? '',
    google_callback_url:  db.google_callback_url  ?? process.env.GOOGLE_CALLBACK_URL  ?? '',
    // Keycloak
    keycloak_enabled:
      db.keycloak_enabled ??
      !!(process.env.KEYCLOAK_CLIENT_ID && process.env.KEYCLOAK_URL),
    keycloak_url:           db.keycloak_url           ?? process.env.KEYCLOAK_URL             ?? '',
    keycloak_public_url:    db.keycloak_public_url    ?? process.env.KEYCLOAK_PUBLIC_URL       ?? '',
    keycloak_realm:         db.keycloak_realm         ?? process.env.KEYCLOAK_REALM            ?? '',
    keycloak_client_id:     db.keycloak_client_id     ?? process.env.KEYCLOAK_CLIENT_ID        ?? '',
    keycloak_client_secret: db.keycloak_client_secret ?? process.env.KEYCLOAK_CLIENT_SECRET    ?? '',
    keycloak_callback_url:  db.keycloak_callback_url  ?? process.env.KEYCLOAK_CALLBACK_URL     ?? '',
    // SMTP
    smtp_enabled: db.smtp_enabled ?? process.env.ENABLE_EMAIL === 'true',
    smtp_host:    db.smtp_host    ?? process.env.SMTP_HOST ?? '',
    smtp_port:    db.smtp_port    ?? parseInt(process.env.SMTP_PORT ?? '587'),
    smtp_secure:  db.smtp_secure  ?? process.env.SMTP_SECURE === 'true',
    smtp_user:    db.smtp_user    ?? process.env.SMTP_USER ?? '',
    smtp_pass:    db.smtp_pass    ?? process.env.SMTP_PASS ?? '',
    smtp_from:    db.smtp_from    ?? process.env.SMTP_FROM ?? '',
  };
}

/** Returns settings with sensitive fields replaced by MASK (for API responses) */
export function maskSettings(s: AppSettings): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s };
  for (const key of SENSITIVE) {
    out[key] = (s as any)[key] ? MASK : '';
  }
  return out;
}

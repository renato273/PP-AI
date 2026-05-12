import { useState, useEffect } from 'react';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import {
  Globe, Shield, Mail, Bot, Eye, EyeOff,
  Save, RefreshCw, CheckCircle, XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AppSettings {
  google_enabled: boolean;
  google_client_id: string;
  google_client_secret: string;
  google_callback_url: string;
  keycloak_enabled: boolean;
  keycloak_url: string;
  keycloak_public_url: string;
  keycloak_realm: string;
  keycloak_client_id: string;
  keycloak_client_secret: string;
  keycloak_callback_url: string;
  smtp_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
}

const MASK = '••••••••';

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        value ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function Field({
  label, value, onChange, placeholder = '', type = 'text', hint,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  const isSecret = type === 'password';
  const inputType = isSecret ? (show ? 'text' : 'password') : type;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={e => { if (isSecret && e.target.value === MASK) onChange(''); }}
          className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg
                     text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function SectionCard({
  icon: Icon, title, color, enabled, onToggle, children, badge,
}: {
  icon: React.ElementType;
  title: string;
  color: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            {badge && <span className="text-xs text-gray-400">{badge}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {enabled
            ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle className="w-3.5 h-3.5" />Activo</span>
            : <span className="flex items-center gap-1 text-xs text-gray-400"><XCircle className="w-3.5 h-3.5" />Inactivo</span>
          }
          <Toggle value={enabled} onChange={onToggle} />
        </div>
      </div>
      {enabled && (
        <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminSettings();
      setSettings(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key: keyof AppSettings, val: any) =>
    setSettings(prev => prev ? { ...prev, [key]: val } : prev);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.updateAdminSettings(settings);
      setSettings(updated);
      toast.success('Configuración guardada');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Configuración del Sistema</h1>
          <p className="text-sm text-gray-500 mt-0.5">Integraciones y servicios externos</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium
                     hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {/* Google OAuth */}
      <SectionCard
        icon={Globe} title="Google OAuth" color="bg-red-500"
        enabled={settings.google_enabled}
        onToggle={v => set('google_enabled', v)}
        badge="Inicio de sesión con cuenta Google"
      >
        <Field label="Client ID" value={settings.google_client_id}
          onChange={v => set('google_client_id', v)}
          placeholder="xxxx.apps.googleusercontent.com" />
        <Field label="Client Secret" value={settings.google_client_secret}
          onChange={v => set('google_client_secret', v)}
          type="password" placeholder="GOCSPX-..." />
        <div className="md:col-span-2">
          <Field label="Callback URL" value={settings.google_callback_url}
            onChange={v => set('google_callback_url', v)}
            placeholder="https://tu-dominio.com/api/auth/google/callback"
            hint="Debe coincidir exactamente con la URL registrada en Google Cloud Console" />
        </div>
      </SectionCard>

      {/* Keycloak SSO */}
      <SectionCard
        icon={Shield} title="Keycloak SSO" color="bg-blue-600"
        enabled={settings.keycloak_enabled}
        onToggle={v => set('keycloak_enabled', v)}
        badge="Single Sign-On corporativo"
      >
        <Field label="URL interna (backend → Keycloak)" value={settings.keycloak_url}
          onChange={v => set('keycloak_url', v)}
          placeholder="http://keycloak:8080"
          hint="URL Docker-interna que usa el backend para llamadas API" />
        <Field label="URL pública (navegador → Keycloak)" value={settings.keycloak_public_url}
          onChange={v => set('keycloak_public_url', v)}
          placeholder="https://keycloak.tu-dominio.com"
          hint="URL que ve el navegador del usuario" />
        <Field label="Realm" value={settings.keycloak_realm}
          onChange={v => set('keycloak_realm', v)} placeholder="ppai" />
        <Field label="Client ID" value={settings.keycloak_client_id}
          onChange={v => set('keycloak_client_id', v)} placeholder="ppai-app" />
        <Field label="Client Secret" value={settings.keycloak_client_secret}
          onChange={v => set('keycloak_client_secret', v)}
          type="password" placeholder="Copia desde Credentials en Keycloak" />
        <Field label="Callback URL" value={settings.keycloak_callback_url}
          onChange={v => set('keycloak_callback_url', v)}
          placeholder="https://tu-dominio.com/api/auth/keycloak/callback" />
      </SectionCard>

      {/* SMTP Email */}
      <SectionCard
        icon={Mail} title="Email / SMTP" color="bg-amber-500"
        enabled={settings.smtp_enabled}
        onToggle={v => set('smtp_enabled', v)}
        badge="Notificaciones y recordatorios por correo"
      >
        <Field label="Host SMTP" value={settings.smtp_host}
          onChange={v => set('smtp_host', v)} placeholder="smtp.gmail.com" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Puerto" value={settings.smtp_port}
            onChange={v => set('smtp_port', v)} type="number" placeholder="587" />
          <div className="flex flex-col justify-end">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">TLS/SSL</label>
            <div className="flex items-center gap-3">
              <Toggle value={settings.smtp_secure} onChange={v => set('smtp_secure', v)} />
              <span className="text-sm text-gray-500">{settings.smtp_secure ? 'Activado (puerto 465)' : 'STARTTLS (puerto 587)'}</span>
            </div>
          </div>
        </div>
        <Field label="Usuario SMTP" value={settings.smtp_user}
          onChange={v => set('smtp_user', v)} placeholder="noreply@tu-dominio.com" />
        <Field label="Contraseña SMTP" value={settings.smtp_pass}
          onChange={v => set('smtp_pass', v)}
          type="password" placeholder="App password o contraseña SMTP" />
        <div className="md:col-span-2">
          <Field label="Nombre remitente (From)" value={settings.smtp_from}
            onChange={v => set('smtp_from', v)}
            placeholder="PP-AI"
            hint="Aparecerá como remitente en los correos enviados" />
        </div>
      </SectionCard>

      {/* AI Config — link to existing page */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-600">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Inteligencia Artificial</h3>
              <span className="text-xs text-gray-400">Proveedor, modelo y clave API</span>
            </div>
          </div>
          <Link
            to="/ai-config"
            className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400
                       border border-primary-300 dark:border-primary-700 rounded-lg
                       hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
          >
            Configurar IA →
          </Link>
        </div>
      </div>

      {/* Save footer */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium
                     hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Guardando...' : 'Guardar todos los cambios'}
        </button>
      </div>
    </div>
  );
}

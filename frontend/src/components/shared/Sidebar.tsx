import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  Users,
  GanttChart,
  LogOut,
  ChevronLeft,
  Layers,
  ShieldCheck,
  Moon,
  Sun,
  Bot,
  X,
  Settings,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useT } from '../../i18n';

const navKeys = [
  { to: '/dashboard', icon: LayoutDashboard, key: 'nav.dashboard' },
  { to: '/programas', icon: Layers, key: 'nav.programs' },
  { to: '/proyectos', icon: FolderKanban, key: 'nav.projects' },
  { to: '/cronograma', icon: GanttChart, key: 'nav.schedule' },
  { to: '/equipo', icon: Users, key: 'nav.team' },
  { to: '/ai-config', icon: Bot, key: 'nav.aiconfig', adminOnly: true },
  { to: '/usuarios', icon: ShieldCheck, key: 'nav.users', adminOnly: true },
  { to: '/admin/settings', icon: Settings, key: 'nav.settings', adminOnly: true },
] as const;

function SidebarContent({ mobile = false }: { mobile?: boolean }) {
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar, darkMode, toggleDarkMode, setMobileMenuOpen } = useUIStore();
  const t = useT();

  const expanded = mobile ? true : sidebarOpen;
  const handleNavClick = () => { if (mobile) setMobileMenuOpen(false); };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-white/20 rounded-lg">
            <BarChart3 className="w-5 h-5" />
          </div>
          {expanded && <span className="font-bold text-lg">PP-AI</span>}
        </div>
        {mobile ? (
          <button onClick={() => setMobileMenuOpen(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={toggleSidebar} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <ChevronLeft className={`w-4 h-4 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navKeys
          .filter((item) => !('adminOnly' in item && item.adminOnly) || user?.rol === 'admin')
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {expanded && <span>{t(item.key as any)}</span>}
            </NavLink>
          ))}
      </nav>

      {/* User / Logout */}
      <div className="p-3 border-t border-white/10 flex-shrink-0">
        {expanded && user && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium truncate">{user.nombre}</p>
            <p className="text-xs text-white/50 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={toggleDarkMode}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors mb-1"
        >
          {darkMode ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
          {expanded && <span>{darkMode ? t('nav.lightmode') : t('nav.darkmode')}</span>}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {expanded && <span>{t('nav.logout')}</span>}
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { sidebarOpen, mobileMenuOpen, setMobileMenuOpen } = useUIStore();

  return (
    <>
      {/* ── Desktop sidebar (md+) ─────────────────────────────────── */}
      <aside
        className={`hidden md:flex fixed left-0 top-0 h-screen bg-primary-600 text-white flex-col transition-all duration-300 z-40 ${
          sidebarOpen ? 'w-60' : 'w-[72px]'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile: backdrop ──────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile: slide-in drawer ───────────────────────────────── */}
      <aside
        className={`md:hidden fixed left-0 top-0 h-screen w-72 bg-primary-600 text-white flex flex-col z-50 transition-transform duration-300 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent mobile />
      </aside>
    </>
  );
}

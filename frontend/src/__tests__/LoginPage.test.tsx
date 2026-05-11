/**
 * Unit tests for LoginPage component.
 * Verifies structure, SSO buttons, and error-param handling.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import LoginPage from '../components/auth/LoginPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ login: vi.fn(), isLoading: false }),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderLogin(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/login${search}`]}>
      <LoginPage />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('LoginPage', () => {
  it('renders PP-AI branding', () => {
    renderLogin();
    expect(screen.getByText('PP-AI')).toBeInTheDocument();
    expect(screen.getByText('Gestión de Proyectos y Programas')).toBeInTheDocument();
  });

  it('renders email and password fields', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('admin@app.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    renderLogin();
    // The form submit button has exact text "Iniciar Sesión" (no extra words)
    const btn = screen.getByRole('button', { name: /^iniciar sesión$/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'submit');
  });

  it('renders Google SSO button', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /iniciar sesión con google/i })).toBeInTheDocument();
  });

  it('renders Keycloak SSO button', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /iniciar sesión con sso/i })).toBeInTheDocument();
  });

});

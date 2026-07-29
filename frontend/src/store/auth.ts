import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface User {
  userId:             number;
  email:              string;
  rol:                string;
  nombre_completo?:   string;
  nombres?:           string;
  apellido_paterno?:  string;
  producer_id?:       number;
  estado_asignado?:   string | null;
  debe_cambiar_pass?: boolean;
  es_panel_usuario?:  boolean;
  redirect_post_login?:string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, user) => {
        localStorage.setItem('simac_token', token);
        set({ token, user, isAuthenticated: true });
      },
      logout: () => {
        const token = localStorage.getItem('simac_token');
        if (token) {
          // Revoca el token en el servidor (denylist) para que deje de ser
          // válido de inmediato, en vez de esperar a su expiración natural.
          fetch(`${BASE}/auth/logout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
        localStorage.removeItem('simac_token');
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'simac-auth',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

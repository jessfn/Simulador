import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import IconoFrijol from '../../components/IconoFrijol';
import { useAuthStore } from '../../store/auth';

// Para técnicos con maíz y frijol: "¿Qué vas a registrar hoy?". Recuerda la última elección en el teléfono.
const CLAVE = 'simac_ultimo_programa';

export function ultimoPrograma(): 'maiz' | 'frijol' | null {
  try { const v = localStorage.getItem(CLAVE); return v === 'maiz' || v === 'frijol' ? v : null; } catch { return null; }
}

export default function ElegirProgramaPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const ultimo = ultimoPrograma();

  function elegir(p: 'maiz' | 'frijol') {
    try { localStorage.setItem(CLAVE, p); } catch { /* sin almacenamiento: no se recuerda */ }
    navigate(p === 'maiz' ? '/maiz/tecnico' : '/frijol/tecnico');
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#061510] via-[#0c2e1a] to-[#1A5C38] flex flex-col items-center justify-center px-6 py-10"
      style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}>
      <h1 className="text-white text-[26px] font-bold text-center" style={{ fontFamily: 'Patria, Georgia, serif' }}>¿Qué vas a registrar hoy?</h1>
      <p className="text-white/55 text-[14px] mt-1 mb-8 text-center">{user?.nombre_completo || user?.nombres || ''}</p>

      <div className="w-full max-w-[380px] space-y-3">
        <button onClick={() => elegir('maiz')}
          className="w-full flex items-center gap-4 rounded-2xl bg-white/10 ring-1 ring-white/20 p-5 text-left active:scale-[0.98] transition-transform">
          <img src="/images/maiz-icono.png" alt="" className="h-11 w-auto" style={{ filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
          <span className="flex-1">
            <span className="block text-white font-bold text-[20px]" style={{ fontFamily: 'Patria, Georgia, serif' }}>Maíz</span>
            {ultimo === 'maiz' && <span className="text-[12px] text-emerald-300">Última elección</span>}
          </span>
          <ChevronRight className="text-white/40" />
        </button>
        <button onClick={() => elegir('frijol')}
          className="w-full flex items-center gap-4 rounded-2xl bg-white/10 ring-1 ring-white/20 p-5 text-left active:scale-[0.98] transition-transform">
          <IconoFrijol className="h-11 w-11" gradiente={false} />
          <span className="flex-1">
            <span className="block text-white font-bold text-[20px]" style={{ fontFamily: 'Patria, Georgia, serif' }}>Frijol</span>
            {ultimo === 'frijol' && <span className="text-[12px] text-emerald-300">Última elección</span>}
          </span>
          <ChevronRight className="text-white/40" />
        </button>
      </div>
    </div>
  );
}

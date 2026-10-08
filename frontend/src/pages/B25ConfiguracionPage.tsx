import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock, Eye, EyeOff, Bell, BellOff, ChevronRight, Check, Shield
} from 'lucide-react';
import { PageBanner } from '../components/Layout';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}`, 'Content-Type': 'application/json' });

function Spinner() {
  return <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}

export default function B25ConfiguracionPage() {
  const navigate = useNavigate();

  // Cambio de contraseña
  const [passActual, setPassActual]   = useState('');
  const [passNueva, setPassNueva]     = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [showActual, setShowActual]   = useState(false);
  const [showNueva, setShowNueva]     = useState(false);
  const [savingPass, setSavingPass]   = useState(false);
  const [passError, setPassError]     = useState<string | null>(null);
  const [passOk, setPassOk]           = useState(false);

  // Preferencias de notificaciones
  const [notifTransacciones, setNotifTransacciones] = useState(true);
  const [notifPrecios, setNotifPrecios]             = useState(true);
  const [notifAlertas, setNotifAlertas]             = useState(true);

  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function cambiarContrasena() {
    setPassError(null);
    setPassOk(false);

    if (!passActual || !passNueva || !passConfirm) {
      setPassError('Completa todos los campos');
      return;
    }
    if (passNueva.length < 6) {
      setPassError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (passNueva !== passConfirm) {
      setPassError('Las contraseñas no coinciden');
      return;
    }

    setSavingPass(true);
    try {
      const r = await fetch(`${BASE}/auth/cambiar-password`, {
        method: 'POST',
        headers: HDR(),
        body: JSON.stringify({ password_actual: passActual, password_nuevo: passNueva }),
      });
      const d = await r.json();
      if (r.ok) {
        setPassOk(true);
        setPassActual('');
        setPassNueva('');
        setPassConfirm('');
        showToast('¡Contraseña actualizada correctamente!');
      } else {
        setPassError(d.error || 'Error al cambiar la contraseña');
      }
    } catch {
      setPassError('Error de conexión. Intenta de nuevo.');
    } finally {
      setSavingPass(false);
    }
  }

  const toggleItem = (setter: React.Dispatch<React.SetStateAction<boolean>>, current: boolean) => {
    setter(!current);
    showToast('Preferencia guardada');
  };

  return (
    <div className="bg-white min-h-screen pb-8">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-gray-900/90 text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-xl backdrop-blur-md">
          {toast}
        </div>
      )}

      <PageBanner
        title="Configuración"
        subtitle="Seguridad y preferencias"
        back={-1}
      />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="max-w-4xl mx-auto space-y-6">

        {/* ── Seguridad ── */}
        <div className="bg-white rounded-[1.5rem] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04]">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-[#1A5C38]/10 flex items-center justify-center">
              <Shield size={15} className="text-[#1A5C38]" />
            </div>
            <p className="text-[15px] font-bold text-gray-800">Cambiar contraseña</p>
          </div>

          <div className="space-y-3">
            {/* Contraseña actual */}
            <div className="relative">
              <label className="text-[13px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Contraseña actual</label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showActual ? 'text' : 'password'}
                  value={passActual}
                  onChange={e => setPassActual(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-11 pr-10 py-4 bg-[#eef8f2] border-0 focus:ring-2 focus:ring-[#1A5C38]/30 rounded-[1rem] text-[16px] font-medium outline-none transition-all"
                />
                <button type="button" onClick={() => setShowActual(!showActual)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showActual ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Contraseña nueva */}
            <div className="pt-2">
              <label className="text-[13px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Nueva contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showNueva ? 'text' : 'password'}
                  value={passNueva}
                  onChange={e => setPassNueva(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  className="w-full pl-11 pr-10 py-4 bg-[#eef8f2] border-0 focus:ring-2 focus:ring-[#1A5C38]/30 rounded-[1rem] text-[16px] font-medium outline-none transition-all"
                />
                <button type="button" onClick={() => setShowNueva(!showNueva)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showNueva ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirmar */}
            <div className="pt-2">
              <label className="text-[13px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Confirmar nueva contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={passConfirm}
                  onChange={e => setPassConfirm(e.target.value)}
                  placeholder="Repite la nueva contraseña"
                  autoComplete="new-password"
                  className={`w-full pl-11 pr-4 py-4 bg-[#eef8f2] border-2 rounded-[1rem] text-[16px] font-medium outline-none transition-all
                    ${passConfirm && passNueva !== passConfirm
                      ? 'border-red-300 bg-red-50 focus:ring-0'
                      : passConfirm && passNueva === passConfirm
                      ? 'border-green-400 bg-green-50 focus:ring-0'
                      : 'border-transparent focus:border-transparent focus:ring-2 focus:ring-[#1A5C38]/30'
                    }`}
                />
              </div>
            </div>

            {/* Error / Success */}
            {passError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {passError}
              </p>
            )}
            {passOk && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2 flex items-center gap-1.5">
                <Check size={12} /> Contraseña actualizada correctamente
              </p>
            )}

            {/* Botón guardar */}
            <div className="pt-4">
              <button
                onClick={cambiarContrasena}
                disabled={savingPass}
                className="w-full flex items-center justify-center gap-2 bg-[#1A5C38] hover:bg-[#15482d] text-white py-4 rounded-[1.25rem] text-[17px] font-bold disabled:opacity-60 active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)]"
              >
                {savingPass ? <><Spinner /> Guardando...</> : <><Lock size={18} /> Cambiar contraseña</>}
              </button>
            </div>
          </div>
        </div>

        {/* ── Notificaciones ── */}
        <div className="bg-white rounded-[1.5rem] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04]">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-[#1A5C38]/10 flex items-center justify-center">
              <Bell size={15} className="text-[#1A5C38]" />
            </div>
            <p className="text-[15px] font-bold text-gray-800">Notificaciones</p>
          </div>

          <div className="space-y-1">
            {[
              { label: 'Transacciones', desc: 'Alertas de compra y venta de maíz', value: notifTransacciones, set: setNotifTransacciones },
              { label: 'Precios de mercado', desc: 'Cambios en Chicago CME y tipo de cambio', value: notifPrecios, set: setNotifPrecios },
              { label: 'Alertas del sistema', desc: 'Avisos importantes del administrador', value: notifAlertas, set: setNotifAlertas },
            ].map(({ label, desc, value, set }) => (
              <div
                key={label}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-[#f4fbf7] active:bg-[#eef8f2] transition-colors cursor-pointer"
                onClick={() => toggleItem(set, value)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0">
                    {value
                      ? <Bell size={14} className="text-[#1A5C38]" />
                      : <BellOff size={14} className="text-gray-400" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                </div>
                {/* Toggle switch */}
                <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${value ? 'bg-[#1A5C38]' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Accesos rápidos ── */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] overflow-hidden transition-transform duration-500 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group/card">
          <button
            onClick={() => navigate('/maiz/bodega/notificaciones')}
            className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-[#f4fbf7]/50 active:bg-[#eef8f2] transition-colors"
          >
            <div className="w-12 h-12 rounded-[1.25rem] bg-[#1A5C38]/[0.08] flex items-center justify-center flex-shrink-0 transition-transform duration-500 group-hover/card:scale-110 group-hover/card:-rotate-3">
              <Bell size={22} className="text-[#1A5C38]" />
            </div>
            <div className="flex-1 transition-transform duration-500 group-hover/card:translate-x-1">
              <p className="text-[16px] font-bold text-gray-900">Ver mis notificaciones</p>
              <p className="text-[13px] text-gray-500 font-medium mt-0.5">Historial completo de alertas</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 transition-transform duration-300 group-hover/card:translate-x-1 group-hover/card:text-[#1A5C38]" />
          </button>
        </div>

        {/* Info de versión */}
        <div className="text-center py-4">
          <p className="text-[13px] font-medium text-gray-400">Maíz · Plan Nacional Maíz 2026 · v1.0</p>
        </div>

        </div>
      </div>
    </div>
  );
}

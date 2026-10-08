import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVolver } from '../hooks/useVolver';
import {
  ChevronLeft, Warehouse, Factory, Eye, EyeOff,
  AlertCircle, Loader2, Wheat, Check, ShieldCheck,
  MapPin, Lock, User,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import AvisoPrivacidadStep, { type AvisoData } from './auth/AvisoPrivacidadStep';

type Rol  = 'bodega' | 'industria';
type Paso = 'form' | 'aviso';

export default function B02Register() {
  const [paso,  setPaso]  = useState<Paso>('form');
  const [rol,   setRol]   = useState<Rol>('bodega');
  const [form,  setForm]  = useState({
    nombre_completo: '', email: '', telefono: '', curp: '',
    state_id: '', municipality_id: '', password: '', confirm: '',
  });
  const [states,         setStates]         = useState<any[]>([]);
  const [municipalities, setMunicipalities] = useState<any[]>([]);
  const [showPwd,        setShowPwd]        = useState(false);
  const [showConfirm,    setShowConfirm]    = useState(false);
  const [error,          setError]          = useState('');
  const [loading,        setLoading]        = useState(false);
  const { setAuth } = useAuthStore();
  const navigate    = useNavigate();
  const volver = useVolver('/maiz/bodega/login');

  useEffect(() => {
    api.auth.states().then((res: any) => setStates(res.states || res)).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.state_id) {
      api.auth.municipalities(form.state_id)
        .then((res: any) => setMunicipalities(res.municipalities || res))
        .catch(() => {});
    }
  }, [form.state_id]);

  function norm(v: string) {
    return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  }
  const setNombre   = (v: string) => setForm(f => ({ ...f, nombre_completo: norm(v) }));
  const setTelefono = (v: string) => setForm(f => ({ ...f, telefono: v.replace(/\D/g, '').slice(0, 10) }));
  const setCurp     = (v: string) => setForm(f => ({ ...f, curp: norm(v).replace(/[^A-Z0-9]/g, '').slice(0, 18) }));
  const set         = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{2}[A-Z]{3}[A-Z0-9]\d$/;

  function handleContinuarAlAviso(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre_completo.trim())  { setError('El nombre es obligatorio'); return; }
    if (form.telefono.length !== 10)   { setError('El teléfono debe tener exactamente 10 dígitos'); return; }
    if (!form.curp.trim())             { setError('La CURP es obligatoria'); return; }
    if (form.curp.length !== 18 || !CURP_REGEX.test(form.curp)) { setError('CURP inválida. Revisa el formato.'); return; }
    if (!form.state_id)                { setError('Selecciona tu estado'); return; }
    if (!form.municipality_id)         { setError('Selecciona tu municipio'); return; }
    if (form.password !== form.confirm){ setError('Las contraseñas no coinciden'); return; }
    if (form.password.length < 8)     { setError('La contraseña debe tener al menos 8 caracteres'); return; }
    setError('');
    setPaso('aviso');
  }

  async function handleAvisoAceptado(datos: AvisoData) {
    setLoading(true);
    try {
      const payload: any = {
        nombre_completo:           form.nombre_completo.trim(),
        email:                     form.email.trim(),
        telefono:                  form.telefono,
        curp:                      form.curp,
        state_id:                  form.state_id,
        municipality_id:           form.municipality_id,
        password:                  form.password,
        rol,
        aviso_privacidad_aceptado: datos.aceptado,
        aviso_privacidad_fecha:    datos.fecha,
        aviso_privacidad_lat:      datos.lat,
        aviso_privacidad_lng:      datos.lng,
        aviso_privacidad_version:  datos.version,
        aviso_privacidad_foto_url: datos.fotoUrl,
      };
      const res = await api.auth.registro(payload);
      if (res.token) {
        const u = res.usuario || res.user;
        setAuth(res.token, { ...u, userId: u?.id ?? u?.userId });
        navigate('/maiz/bodega/seleccionar');
      } else {
        navigate('/maiz/bodega/login');
      }
    } catch (err: any) {
      setError(err.message || 'Error al registrar');
      setPaso('form');
    } finally {
      setLoading(false);
    }
  }

  if (paso === 'aviso') {
    return (
      <AvisoPrivacidadStep
        contexto="bodeguero"
        onAceptar={handleAvisoAceptado}
        onBack={() => setPaso('form')}
      />
    );
  }

  // Clases base
  const inp = 'w-full bg-white/[0.08] ring-1 ring-white/10 rounded-xl px-4 py-3 text-sm sm:text-base text-white placeholder-white/30 focus:ring-2 focus:ring-white/30 focus:outline-none transition-all';
  const lbl = 'block text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5';
  const card = 'bg-white/[0.07] ring-1 ring-white/[0.09] rounded-2xl';

  const curpValida   = form.curp.length === 18 && CURP_REGEX.test(form.curp);
  const curpInvalida = form.curp.length === 18 && !CURP_REGEX.test(form.curp);

  return (
    <div
      className="fixed inset-0 flex bg-gradient-to-br from-[#061510] via-[#0b271a] to-[#142e1d]"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Fondo decorativo */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-green-500/[0.04] blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-emerald-600/[0.04] blur-3xl" />
      </div>

      {/* ── SIDEBAR desktop ── */}
      <aside className="hidden lg:flex w-[280px] xl:w-[310px] flex-shrink-0 flex-col z-10 border-r border-white/[0.06] px-7 py-10">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 bg-green-400/15 rounded-xl flex items-center justify-center ring-1 ring-green-400/20">
            <Wheat size={17} className="text-green-300" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">Maíz</p>
            <p className="text-white/35 text-[11px] mt-0.5">Plan Maíz 2026</p>
          </div>
        </div>

        {/* Descripción del registro */}
        <div className="flex-1">
          <h2 className="text-white font-bold text-lg leading-snug mb-2">Registro de Bodega<br />o Industria</h2>
          <p className="text-white/40 text-sm leading-relaxed mb-8">
            Forma parte del sistema de trazabilidad y comercialización de maíz en México.
          </p>

          <div className="space-y-4">
            {[
              { icon: ShieldCheck, text: 'Acceso verificado y seguro', sub: 'Aviso de privacidad incluido' },
              { icon: MapPin,      text: 'Conecta con productores locales', sub: 'Red de proveedores en tu región' },
              { icon: Warehouse,   text: 'Control de inventario', sub: 'Registro de entradas y salidas' },
            ].map(({ icon: Icon, text, sub }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-green-500/10 ring-1 ring-green-400/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={13} className="text-green-300" />
                </div>
                <div>
                  <p className="text-white/70 text-[13px] font-medium leading-tight">{text}</p>
                  <p className="text-white/30 text-[11px] mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/15 text-[11px] leading-relaxed">
          Secretaría de Agricultura<br />y Desarrollo Rural
        </p>
      </aside>

      {/* ── PANEL DERECHO ── */}
      <div className="flex-1 flex flex-col min-w-0 z-10">

        {/* Header fijo */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 sm:px-6 lg:px-10 py-3.5 border-b border-white/[0.06]">
          <button
            onClick={volver}
            className="p-2 -ml-1 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors flex items-center gap-1.5 text-white/50 hover:text-white/80"
          >
            <ChevronLeft size={19} />
            <span className="text-sm font-medium hidden sm:inline">Iniciar sesión</span>
          </button>
          <div className="flex-1" />
          {/* OCULTO C11 — acceso a registro de productor
          <button
            onClick={() => navigate('/maiz', { state: { menu: 'productor' } })}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-green-300/60 hover:text-green-300 transition-colors"
          >
            <Wheat size={13} /> <span className="hidden sm:inline">¿Eres productor?</span>
          </button>
          */}
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="min-h-full flex flex-col items-center px-4 sm:px-6 lg:px-10 py-6 lg:py-8">
            <div className="w-full max-w-[560px] my-auto">

              <form onSubmit={handleContinuarAlAviso} className="animate-auth-in space-y-5">

                {/* Título */}
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Crear cuenta</h1>
                  <p className="text-white/40 text-sm mt-1">Bodega o Industria — Plan Maíz 2026</p>
                </div>

                {/* ── TIPO DE CUENTA ── */}
                <div className={`${card} p-4 sm:p-5`}>
                  <p className={lbl}>Tipo de cuenta</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      { key: 'bodega'    as Rol, icon: Warehouse, label: 'Bodega',    desc: 'Almacenista · Acopiador' },
                      { key: 'industria' as Rol, icon: Factory,   label: 'Industria', desc: 'Tortillería · Nixtamal' },
                    ]).map(({ key, icon: Icon, label, desc }) => (
                      <button key={key} type="button" onClick={() => setRol(key)}
                        className={`flex items-center gap-3 px-4 py-3.5 rounded-xl ring-1 transition-all duration-150 active:scale-[0.97] text-left
                          ${rol === key
                            ? 'ring-white/40 bg-white/15 shadow-lg shadow-black/20'
                            : 'ring-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${rol === key ? 'bg-white' : 'bg-white/10'}`}>
                          <Icon size={18} className={rol === key ? 'text-[#0b271a]' : 'text-white/50'} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-bold leading-tight ${rol === key ? 'text-white' : 'text-white/55'}`}>{label}</p>
                          <p className="text-[10px] mt-0.5 text-white/30 truncate">{desc}</p>
                        </div>
                        {rol === key && <Check size={14} className="text-green-300 flex-shrink-0 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── DATOS PERSONALES ── */}
                <div className={`${card} p-4 sm:p-5`}>
                  <div className="flex items-center gap-2 mb-3.5">
                    <User size={13} className="text-white/35" />
                    <p className={`${lbl} mb-0`}>Datos personales</p>
                  </div>

                  {/* Nombre — fila completa */}
                  <div className="mb-3">
                    <label className={lbl}>Nombre completo <span className="text-red-400">*</span></label>
                    <input type="text" value={form.nombre_completo} onChange={e => setNombre(e.target.value)}
                      placeholder="NOMBRE COMPLETO" required autoCapitalize="characters"
                      className={`${inp} tracking-wide uppercase`} />
                  </div>

                  {/* Email + Teléfono */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className={lbl}>Correo electrónico <span className="text-red-400">*</span></label>
                      <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                        placeholder="correo@empresa.com" required autoCapitalize="off" inputMode="email" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Teléfono <span className="text-red-400">*</span></label>
                      <input type="tel" value={form.telefono} onChange={e => setTelefono(e.target.value)}
                        placeholder="10 dígitos" required maxLength={10} inputMode="numeric"
                        className={`${inp} font-mono tracking-wider`} />
                    </div>
                  </div>

                  {/* CURP — fila completa con validación */}
                  <div>
                    <label className={lbl}>CURP <span className="text-red-400">*</span></label>
                    <input type="text" value={form.curp} onChange={e => setCurp(e.target.value)}
                      placeholder="AAAA000000AAAAAA00" required maxLength={18} autoCapitalize="characters"
                      className={`${inp} font-mono tracking-widest text-center text-base sm:text-lg ${
                        curpValida ? 'ring-green-400/40' : curpInvalida ? 'ring-red-400/40' : ''
                      }`} />
                    <div className="flex justify-between items-center mt-1.5">
                      {curpValida && (
                        <p className="text-[11px] text-green-300 flex items-center gap-1"><Check size={11} strokeWidth={3} /> CURP válida</p>
                      )}
                      {curpInvalida && (
                        <p className="text-[11px] text-red-300 flex items-center gap-1"><AlertCircle size={11} /> Formato inválido</p>
                      )}
                      {!curpValida && !curpInvalida && form.curp.length > 0 && (
                        <p className="text-[11px] text-white/30">Faltan {18 - form.curp.length} caracteres</p>
                      )}
                      <span className={`text-[11px] font-mono ml-auto ${form.curp.length === 18 ? 'text-green-400' : 'text-white/25'}`}>{form.curp.length}/18</span>
                    </div>
                  </div>
                </div>

                {/* ── UBICACIÓN ── */}
                <div className={`${card} p-4 sm:p-5`}>
                  <div className="flex items-center gap-2 mb-3.5">
                    <MapPin size={13} className="text-white/35" />
                    <p className={`${lbl} mb-0`}>Ubicación de operación</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Estado <span className="text-red-400">*</span></label>
                      <select value={form.state_id}
                        onChange={e => { set('state_id', e.target.value); set('municipality_id', ''); }}
                        required className={`${inp} appearance-none [&>option]:bg-[#0c2e1a] [&>option]:text-white`}>
                        <option value="">Selecciona...</option>
                        {states.map((s: any) => (
                          <option key={s.state_id || s.id} value={s.state_id || s.id}>{s.name || s.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Municipio <span className="text-red-400">*</span></label>
                      <select value={form.municipality_id}
                        onChange={e => set('municipality_id', e.target.value)}
                        required disabled={!form.state_id}
                        className={`${inp} appearance-none [&>option]:bg-[#0c2e1a] [&>option]:text-white disabled:opacity-35`}>
                        <option value="">{form.state_id ? 'Selecciona...' : 'Elige estado primero'}</option>
                        {municipalities.map((m: any) => (
                          <option key={m.municipality_id || m.id} value={m.municipality_id || m.id}>{m.name || m.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* ── CONTRASEÑA ── */}
                <div className={`${card} p-4 sm:p-5`}>
                  <div className="flex items-center gap-2 mb-3.5">
                    <Lock size={13} className="text-white/35" />
                    <p className={`${lbl} mb-0`}>Contraseña de acceso</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Contraseña <span className="text-red-400">*</span></label>
                      <div className="relative">
                        <input type={showPwd ? 'text' : 'password'} value={form.password}
                          onChange={e => set('password', e.target.value)}
                          placeholder="Mínimo 8 caracteres" required className={`${inp} pr-11`} />
                        <button type="button" onClick={() => setShowPwd(p => !p)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/60 transition-colors">
                          {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {form.password.length > 0 && form.password.length < 8 && (
                        <p className="text-[11px] text-amber-300/80 mt-1">Mínimo 8 caracteres ({form.password.length}/8)</p>
                      )}
                    </div>
                    <div>
                      <label className={lbl}>Confirmar <span className="text-red-400">*</span></label>
                      <div className="relative">
                        <input type={showConfirm ? 'text' : 'password'} value={form.confirm}
                          onChange={e => set('confirm', e.target.value)}
                          placeholder="Repite la contraseña" required
                          className={`${inp} pr-11 ${
                            form.confirm.length > 0 && form.confirm !== form.password ? 'ring-red-400/40' : ''
                          }`} />
                        <button type="button" onClick={() => setShowConfirm(p => !p)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/60 transition-colors">
                          {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {form.confirm.length > 0 && form.confirm !== form.password && (
                        <p className="text-[11px] text-red-300 mt-1 flex items-center gap-1"><AlertCircle size={10} /> No coinciden</p>
                      )}
                      {form.confirm.length >= 8 && form.confirm === form.password && (
                        <p className="text-[11px] text-green-300 mt-1 flex items-center gap-1"><Check size={10} strokeWidth={3} /> Coinciden</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="p-3 bg-red-500/15 ring-1 ring-red-400/25 rounded-xl text-red-300 text-sm flex items-start gap-2">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" /><span>{error}</span>
                  </div>
                )}

                {/* Aviso */}
                <p className="text-[11px] text-white/30 leading-relaxed text-center px-2">
                  Al continuar se te solicitará aceptar el Aviso de Privacidad, tomar una foto de verificación y capturar tu ubicación GPS.
                </p>

                {/* Botón */}
                <button type="submit" disabled={loading}
                  className="w-full bg-white hover:bg-white/90 active:bg-white/80 active:scale-[0.98] text-[#0b271a] py-3.5 rounded-xl text-sm sm:text-base font-bold disabled:opacity-40 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-black/20">
                  {loading
                    ? <><Loader2 size={17} className="animate-spin" /> Creando cuenta…</>
                    : <><ShieldCheck size={17} /> Continuar con el Aviso de Privacidad</>
                  }
                </button>

                {/* Links */}
                <div className="flex items-center justify-between pt-1">
                  <button type="button" onClick={() => navigate('/maiz/bodega/login')}
                    className="text-sm text-white/40 hover:text-white/70 transition-colors font-medium">
                    ¿Ya tienes cuenta?
                  </button>
                  {/* OCULTO C11 — segunda instancia acceso a registro de productor
                  <button type="button" onClick={() => navigate('/maiz', { state: { menu: 'productor' } })}
                    className="flex items-center gap-1.5 text-sm font-semibold text-green-300/70 hover:text-green-200 transition-colors">
                    <Wheat size={13} /> Soy productor
                  </button>
                  */}
                </div>

              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

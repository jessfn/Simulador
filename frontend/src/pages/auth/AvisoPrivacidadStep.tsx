import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Shield, MapPin, CheckCircle2, Camera, Loader2,
  RefreshCw, AlertTriangle, Check, FileText, Eye, Mail, ChevronRight,
  Fingerprint,
} from 'lucide-react';

import BotonAtras from '../../components/BotonAtras';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
export const AVISO_VERSION = '1.0';

export interface AvisoData {
  aceptado: true;
  fecha: string;
  lat: number | null;
  lng: number | null;
  fotoUrl: string;
  version: string;
}

interface Props {
  nombreTitular?: string;
  /** Texto que aparece en la cabecera del aviso — permite personalizar por contexto */
  contexto?: 'productor' | 'bodeguero';
  onAceptar: (datos: AvisoData) => void;
  onBack: () => void;
}

type Fase      = 'texto' | 'verificacion';
type GpsStatus = 'idle' | 'capturing' | 'ok' | 'error';
type CamStatus = 'idle' | 'captured' | 'uploading' | 'ok' | 'error';

export default function AvisoPrivacidadStep({
  onAceptar,
  onBack,
  contexto = 'productor',
}: Props) {
  const [fase,       setFase]       = useState<Fase>('texto');
  const [gpsStatus,  setGpsStatus]  = useState<GpsStatus>('idle');
  const [gpsCoords,  setGpsCoords]  = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError,   setGpsError]   = useState<string | null>(null);
  const [camStatus,  setCamStatus]  = useState<CamStatus>('idle');
  const [camError,   setCamError]   = useState<string | null>(null);
  const [fotoUrl,    setFotoUrl]    = useState<string | null>(null);
  const [fotoPreview,setFotoPreview]= useState<string | null>(null);
  const [aceptando,  setAceptando]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const puedeAceptar = gpsStatus === 'ok' && camStatus === 'ok' && !aceptando;

  /* ── GPS ─────────────────────────────────────── */
  const capturarGPS = useCallback(() => {
    setGpsStatus('capturing');
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus('ok');
      },
      err => {
        setGpsStatus('error');
        setGpsError(
          err.code === 1
            ? 'Permiso de ubicación denegado. Actívalo en ajustes del dispositivo.'
            : 'No se pudo obtener la ubicación. Verifica tu señal.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (fase === 'verificacion' && gpsStatus === 'idle') capturarGPS();
  }, [fase, gpsStatus, capturarGPS]);

  /* ── CÁMARA — input overlay ──────────────────
     Truco: input file con opacity:0 cubre todo el
     área del botón. El tap activa directamente el
     selector nativo del SO → funciona en iOS/Android
     sin getUserMedia, sin HTTPS, sin JS .click().
  ─────────────────────────────────────────────── */
  const subirFoto = async (blob: Blob) => {
    setCamStatus('uploading');
    try {
      const form = new FormData();
      form.append('foto', blob, 'verificacion.jpg');
      const res  = await fetch(`${BASE}/productor/auth/upload-verificacion`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir imagen');
      setFotoUrl(data.path);
      setCamStatus('ok');
    } catch (e: any) {
      setCamError(e.message || 'No se pudo subir la imagen.');
      setCamStatus('error');
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so el mismo archivo puede volver a seleccionarse si retoman
    if (fileRef.current) fileRef.current.value = '';
    const preview = URL.createObjectURL(file);
    setFotoPreview(preview);
    setCamStatus('uploading');
    subirFoto(file);
  };

  const retomar = () => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoPreview(null);
    setFotoUrl(null);
    setCamStatus('idle');
    setCamError(null);
  };

  const handleAceptar = () => {
    if (!puedeAceptar || !fotoUrl) return;
    setAceptando(true);
    onAceptar({
      aceptado: true,
      fecha: new Date().toISOString(),
      lat:  gpsCoords?.lat ?? null,
      lng:  gpsCoords?.lng ?? null,
      fotoUrl,
      version: AVISO_VERSION,
    });
  };

  /* ── RENDER ──────────────────────────────────── */
  return (
    <div
      className="h-[100dvh] flex flex-col bg-gradient-to-b from-[#061510] via-[#0c2e1a] to-[#1A5C38]"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="flex-shrink-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-black/20 backdrop-blur-md">
        <BotonAtras onClick={fase === 'verificacion' ? () => setFase('texto') : onBack} tono="oscuro" />
        <div className="flex-1">
          <p className="text-[10px] font-bold text-green-300 uppercase tracking-widest">
            {fase === 'texto' ? 'Aviso de Privacidad' : 'Verificación de Identidad'}
          </p>
          <p className="text-[12px] text-white/60 mt-0.5">
            {fase === 'texto'
              ? contexto === 'bodeguero' ? 'Requerido para operadores de bodegas' : 'Léelo completo antes de continuar'
              : 'Requerida para completar tu registro'}
          </p>
        </div>
        <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center ring-1 ring-green-400/30">
          {fase === 'texto' ? <FileText size={16} className="text-green-300" /> : <Shield size={16} className="text-green-300" />}
        </div>
      </div>

      {/* ══ FASE 1: TEXTO ══════════════════════════════ */}
      {fase === 'texto' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-white/80 text-[13px] leading-relaxed">

            <div className="bg-white/5 ring-1 ring-white/10 rounded-2xl p-4">
              <h2 className="text-white font-bold text-base mb-1">AVISO DE PRIVACIDAD SIMPLIFICADO</h2>
              <p className="text-green-300 text-[11px] font-semibold uppercase tracking-wider">
                Versión {AVISO_VERSION} — Secretaría de Agricultura y Desarrollo Rural (SADER)
              </p>
            </div>

            <Section title="Identidad del Responsable">
              La <strong className="text-white">Secretaría de Agricultura y Desarrollo Rural (SADER)</strong>,
              con domicilio en Municipio Libre 377, Col. Santa Cruz Atoyac, Alcaldía Benito Juárez, C.P. 03310,
              Ciudad de México, es la responsable del tratamiento de tus datos personales en términos de la
              Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
            </Section>

            <Section title="Datos que Recabamos">
              <ul className="mt-2 space-y-1.5 pl-4">
                <Li>Identificación: nombre completo, CURP, sexo, fecha de nacimiento.</Li>
                <Li>Contacto: teléfono, correo electrónico.</Li>
                <Li>Ubicación GPS del momento de aceptación y de tus unidades de producción.</Li>
                <Li>Datos biométricos: fotografía de verificación de identidad al momento del registro.</Li>
                {contexto === 'productor' && <Li>Patrimoniales: superficie, ubicación y características de parcelas.</Li>}
                {contexto === 'bodeguero' && <Li>Operativos: datos de la bodega o industria que operas.</Li>}
              </ul>
            </Section>

            <Section title="Finalidades del Tratamiento">
              <strong className="text-white">Primarias</strong> (necesarias para el servicio):
              <ul className="mt-1.5 space-y-1 pl-4">
                <Li>Verificar tu identidad ante los padrones de SADER.</Li>
                <Li>Gestionar tu cuenta de acceso a la plataforma.</Li>
                {contexto === 'productor' && <Li>Registrar y administrar tus unidades de producción.</Li>}
                {contexto === 'productor' && <Li>Facilitar la comercialización de cosechas con bodegas registradas.</Li>}
                {contexto === 'bodeguero' && <Li>Administrar operaciones de tu bodega o industria.</Li>}
                {contexto === 'bodeguero' && <Li>Registrar operaciones de acopio y comercialización.</Li>}
                <Li>Cumplir obligaciones legales en materia agrícola y de protección de datos.</Li>
              </ul>
              <br /><strong className="text-white">Secundarias</strong> (puedes oponerte):
              <ul className="mt-1.5 space-y-1 pl-4">
                <Li>Envío de notificaciones sobre programas de apoyo agrícola.</Li>
                <Li>Estadísticas sobre producción agrícola regional.</Li>
              </ul>
            </Section>

            <Section title="Transferencias de Datos">
              <ul className="mt-2 space-y-1.5 pl-4">
                <Li><strong className="text-white">Instancias gubernamentales</strong>: ASERCA, SAGARPA y dependencias de la APF cuando sea requerido por ley.</Li>
                {contexto === 'productor' && <Li><strong className="text-white">Bodegas y acopiadoras</strong> con las que realices operaciones de venta, solo datos necesarios para la transacción.</Li>}
                {contexto === 'bodeguero' && <Li><strong className="text-white">Productores</strong> con los que realices operaciones de compra-venta, solo datos necesarios.</Li>}
              </ul>
              No se realizarán transferencias distintas sin tu consentimiento expreso.
            </Section>

            <Section title="Uso de Ubicación y Fotografía">
              La captura de coordenadas GPS y fotografía al aceptar este aviso tiene como finalidad exclusiva{' '}
              <strong className="text-white">acreditar la identidad del titular y el lugar y momento de la aceptación</strong>,
              con fines de validez jurídica. Se almacenan de forma segura y solo son accesibles por personal autorizado de SADER.
            </Section>

            <Section title="Derechos ARCO">
              Tienes derecho de <strong className="text-white">Acceso, Rectificación, Cancelación y Oposición (ARCO)</strong>. Envía tu solicitud a:
              <div className="mt-2 bg-white/5 rounded-xl p-3 ring-1 ring-white/10 space-y-1.5">
                <p className="flex items-center gap-2"><Mail size={13} className="text-green-400 flex-shrink-0" /> privacidad@agricultura.gob.mx</p>
                <p className="flex items-center gap-2"><MapPin size={13} className="text-green-400 flex-shrink-0" /> Municipio Libre 377, Col. Santa Cruz Atoyac, CDMX</p>
              </div>
              Atención máxima en <strong className="text-white">20 días hábiles</strong>.
            </Section>

            <Section title="Medidas de Seguridad">
              Implementamos medidas administrativas, físicas y técnicas para proteger tus datos contra daño,
              pérdida, alteración o acceso no autorizado, conforme al Reglamento de la LFPDPPP.
            </Section>

            <div className="bg-amber-500/10 ring-1 ring-amber-400/30 rounded-2xl p-4 text-[12px] text-amber-200">
              <p className="font-bold mb-1 flex items-center gap-1.5"><AlertTriangle size={13} className="flex-shrink-0" /> Importante</p>
              <p>Al continuar confirmas haber leído y entendido este aviso, y autorizas el tratamiento de tus datos. Esta aceptación queda registrada con tu fotografía, ubicación GPS y marca de tiempo.</p>
            </div>

            <div className="h-4" />
          </div>

          <div className="px-5 py-4 border-t border-white/10 bg-black/20 backdrop-blur-md">
            <button
              onClick={() => setFase('verificacion')}
              className="w-full bg-white hover:bg-white/90 active:scale-[0.98] text-[#1A5C38] rounded-xl py-3.5 font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-black/30"
            >
              <Eye size={18} /> He leído el aviso — Continuar
            </button>
          </div>
        </div>
      )}

      {/* ══ FASE 2: VERIFICACIÓN ══════════════════════ */}
      {fase === 'verificacion' && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-5 space-y-4">

            {/* ── GPS ─────────────────────────────── */}
            <div className={`rounded-2xl p-4 ring-1 transition-all ${
              gpsStatus === 'ok'    ? 'bg-green-500/10 ring-green-400/30' :
              gpsStatus === 'error' ? 'bg-red-500/10 ring-red-400/30' :
              'bg-white/5 ring-white/10'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ring-1 flex-shrink-0 ${
                  gpsStatus === 'ok'    ? 'bg-green-500/20 ring-green-400/30' :
                  gpsStatus === 'error' ? 'bg-red-500/20 ring-red-400/30' :
                  'bg-white/10 ring-white/15'
                }`}>
                  {gpsStatus === 'capturing'
                    ? <Loader2 size={18} className="text-white animate-spin" />
                    : gpsStatus === 'ok'
                      ? <CheckCircle2 size={18} className="text-green-400" />
                      : <MapPin size={18} className={gpsStatus === 'error' ? 'text-red-400' : 'text-white/60'} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-[14px]">Ubicación de la aceptación</p>
                  <p className={`text-[12px] truncate ${
                    gpsStatus === 'ok'    ? 'text-green-300' :
                    gpsStatus === 'error' ? 'text-red-300' : 'text-white/50'
                  }`}>
                    {gpsStatus === 'idle'      ? 'Solicitando permisos…' :
                     gpsStatus === 'capturing' ? 'Obteniendo ubicación GPS…' :
                     gpsStatus === 'ok'        ? `${gpsCoords!.lat.toFixed(5)}, ${gpsCoords!.lng.toFixed(5)}` :
                     gpsError || 'Error de ubicación'}
                  </p>
                </div>
              </div>
              {gpsStatus === 'error' && (
                <button onClick={capturarGPS} className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-red-300 hover:text-white transition-colors">
                  <RefreshCw size={13} /> Reintentar ubicación
                </button>
              )}
            </div>

            {/* ── CÁMARA ──────────────────────────── */}
            <div className={`rounded-2xl ring-1 overflow-hidden transition-all ${
              camStatus === 'ok'    ? 'ring-green-400/40 bg-green-500/10' :
              camStatus === 'error' ? 'ring-red-400/30 bg-red-500/10' :
              'ring-white/10 bg-white/5'
            }`}>
              {/* Cabecera de la tarjeta */}
              <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ring-1 flex-shrink-0 ${
                  camStatus === 'ok'    ? 'bg-green-500/20 ring-green-400/30' :
                  camStatus === 'error' ? 'bg-red-500/20 ring-red-400/30' :
                  'bg-white/10 ring-white/15'
                }`}>
                  {camStatus === 'uploading'
                    ? <Loader2 size={18} className="text-white animate-spin" />
                    : camStatus === 'ok'
                      ? <CheckCircle2 size={18} className="text-green-400" />
                      : <Fingerprint size={18} className={camStatus === 'error' ? 'text-red-400' : 'text-white/60'} />
                  }
                </div>
                <div>
                  <p className="text-white font-semibold text-[14px]">Verificación biométrica del titular</p>
                  <p className="text-[11px] text-white/50">Requerida para validez jurídica del consentimiento</p>
                </div>
              </div>

              {/* Foto capturada */}
              {fotoPreview && (
                <div className="relative mx-4 mb-3">
                  <img
                    src={fotoPreview}
                    alt="Verificación"
                    className="w-full aspect-square object-cover rounded-xl ring-2 ring-white/10"
                  />
                  {camStatus === 'uploading' && (
                    <div className="absolute inset-0 bg-black/60 rounded-xl flex flex-col items-center justify-center gap-2">
                      <Loader2 size={28} className="text-white animate-spin" />
                      <p className="text-white text-xs font-medium">Guardando verificación…</p>
                    </div>
                  )}
                  {camStatus === 'ok' && (
                    <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1.5 shadow-lg shadow-green-900/50">
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                </div>
              )}

              {/* Error de cámara */}
              {camStatus === 'error' && camError && (
                <div className="mx-4 mb-3 p-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl flex items-start gap-2 text-red-200 text-[12px]">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {camError}
                </div>
              )}

              {/* ── BOTÓN DE CAPTURA CON INPUT OVERLAY ──────────────────────
                  El <input> se posiciona absolutamente sobre el botón visible
                  con opacity:0, cubriendo todo el área táctil.
                  Esto funciona en iOS Safari, Android Chrome, HTTP y HTTPS
                  sin necesidad de getUserMedia ni JS .click().
              ─────────────────────────────────────────────────────────────── */}
              {(camStatus === 'idle' || camStatus === 'error') && (
                <div className="px-4 pb-4">
                  <div className="relative overflow-hidden rounded-xl">
                    {/* Botón visual */}
                    <div className="w-full bg-white text-[#1A5C38] py-4 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg select-none pointer-events-none">
                      <Camera size={19} />
                      {camStatus === 'error' ? 'Volver a capturar' : 'Tomar foto de verificación'}
                    </div>
                    {/* Input invisible encima — TODO el tap lo activa */}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={onFileChange}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        opacity: 0,
                        cursor: 'pointer',
                        fontSize: 0,    // evita zoom en iOS al enfocar
                      }}
                    />
                  </div>
                </div>
              )}

              {camStatus === 'uploading' && !fotoPreview && (
                <div className="flex items-center justify-center gap-2 py-4 text-white/60 text-sm">
                  <Loader2 size={16} className="animate-spin" /> Procesando imagen…
                </div>
              )}

              {/* Retomar / volver a capturar */}
              {(camStatus === 'ok') && (
                <div className="px-4 pb-4">
                  <button
                    onClick={retomar}
                    className="w-full text-[12px] text-white/50 hover:text-white flex items-center justify-center gap-1.5 transition-colors py-1"
                  >
                    <RefreshCw size={12} /> Volver a capturar
                  </button>
                </div>
              )}
            </div>

            {/* ── BOTÓN ACEPTAR ────────────────────── */}
            <div className="pt-1 pb-6">
              <button
                onClick={handleAceptar}
                disabled={!puedeAceptar}
                className="w-full bg-white hover:bg-white/90 active:scale-[0.98] text-[#1A5C38] rounded-xl py-4 font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-black/30 disabled:opacity-30 disabled:cursor-not-allowed text-[15px]"
              >
                {aceptando
                  ? <><Loader2 size={18} className="animate-spin" /> Registrando aceptación…</>
                  : <><CheckCircle2 size={18} /> Acepto el Aviso de Privacidad</>
                }
              </button>

              {!puedeAceptar && !aceptando && (
                <p className="text-center text-[11px] text-white/40 mt-2 space-x-1">
                  {gpsStatus !== 'ok' && <span>Esperando ubicación GPS</span>}
                  {gpsStatus !== 'ok' && camStatus !== 'ok' && <span>·</span>}
                  {camStatus !== 'ok' && <span>Captura tu foto de verificación</span>}
                </p>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-componentes ─────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-white font-bold text-[13px] uppercase tracking-wide border-b border-white/10 pb-1">{title}</h3>
      <div className="text-white/70 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <ChevronRight size={13} className="text-green-400 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

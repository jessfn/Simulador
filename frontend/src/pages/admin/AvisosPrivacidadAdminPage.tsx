import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Download, Eye, MapPin, Calendar, FileText,
  ShieldCheck, Camera, X, ChevronLeft, ChevronRight, Loader2,
  CheckCircle2, AlertTriangle, RefreshCw, Filter, SortAsc, SortDesc,
  Phone, Hash, CheckSquare, Square, FileDown, TableProperties,
  LayoutGrid, ArrowDownToLine, Fingerprint, Globe,
} from 'lucide-react';

/* ─── Configuración ──────────────────────────────────────────────── */
const BASE         = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const UPLOADS_BASE = BASE.replace('/api', '');
const HDR          = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}` });
const POR_PAG      = 25;

/* ─── Tipos ──────────────────────────────────────────────────────── */
interface Aviso {
  tipo: string;           // 'productor' | 'bodega' | 'industria' | 'bodeguero'
  id: string;
  curp: string;
  nombre: string;         // ya unificado desde el backend
  telefono: string | null;
  aviso_privacidad_aceptado: boolean;
  aviso_privacidad_fecha: string | null;
  aviso_privacidad_lat: number | null;
  aviso_privacidad_lng: number | null;
  aviso_privacidad_version: string | null;
  aviso_privacidad_foto_url: string | null;
  estado_validacion: string;
  created_at: string;
}

type SortKey  = 'fecha' | 'nombre' | 'curp' | 'estado';
type SortDir  = 'asc' | 'desc';
type Vista    = 'tabla' | 'cards';

/* ─── Helpers ────────────────────────────────────────────────────── */
const fmt = (iso: string | null, corto = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (corto) return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const nombre = (a: Aviso) => a.nombre || '—';

const fotoURL = (url: string | null) =>
  url ? `${UPLOADS_BASE}/uploads/${url}` : null;

const completitud = (a: Aviso) => {
  let n = 0;
  if (a.aviso_privacidad_aceptado) n++;
  if (a.aviso_privacidad_fecha)    n++;
  if (a.aviso_privacidad_lat)      n++;
  if (a.aviso_privacidad_foto_url) n++;
  return Math.round((n / 4) * 100);
};

/* ─── PDF individual ─────────────────────────────────────────────── */
function generarPDF(a: Aviso) {
  const foto   = fotoURL(a.aviso_privacidad_foto_url);
  const nomb   = nombre(a);
  const coords = a.aviso_privacidad_lat && a.aviso_privacidad_lng
    ? `${a.aviso_privacidad_lat.toFixed(6)}, ${a.aviso_privacidad_lng.toFixed(6)}`
    : 'No disponible';
  const mapsURL = a.aviso_privacidad_lat && a.aviso_privacidad_lng
    ? `https://maps.google.com/?q=${a.aviso_privacidad_lat},${a.aviso_privacidad_lng}`
    : null;
  const pct = completitud(a);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Constancia Aviso Privacidad — ${nomb}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Helvetica Neue',Arial,sans-serif;color:#111;background:#fff;padding:36px 40px;font-size:12px}
    /* Header */
    .hdr{display:flex;align-items:center;justify-content:space-between;padding-bottom:18px;border-bottom:3px solid #0e5c33;margin-bottom:24px}
    .hdr-left{display:flex;align-items:center;gap:14px}
    .logo{width:52px;height:52px;background:#0e5c33;border-radius:12px;display:flex;align-items:center;justify-content:center}
    .logo span{color:#fff;font-weight:900;font-size:13px;letter-spacing:1px}
    .hdr-title h1{font-size:17px;font-weight:900;color:#0e5c33;letter-spacing:-0.3px}
    .hdr-title p{font-size:9px;color:#64748b;margin-top:3px;text-transform:uppercase;letter-spacing:1px}
    .hdr-right{text-align:right}
    .hdr-right .badge{display:inline-block;background:#dcfce7;color:#15803d;font-size:9px;font-weight:800;padding:4px 10px;border-radius:20px;border:1px solid #86efac;text-transform:uppercase;letter-spacing:0.5px}
    .hdr-right p{font-size:9px;color:#94a3b8;margin-top:5px}
    /* Completitud */
    .comp-bar{height:6px;background:#e2e8f0;border-radius:6px;margin-bottom:20px;overflow:hidden}
    .comp-fill{height:100%;background:linear-gradient(90deg,#0e5c33,#22c55e);border-radius:6px;width:${pct}%}
    .comp-label{font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
    /* Grid 2 col */
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
    .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px}
    .card-title{font-size:8px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px}
    .field{margin-bottom:7px}
    .field label{font-size:8px;color:#94a3b8;font-weight:700;display:block;margin-bottom:2px;text-transform:uppercase}
    .field value{font-size:12px;font-weight:700;color:#1e293b;display:block}
    .field .mono{font-family:monospace;font-size:11px}
    /* Foto */
    .foto-section{display:flex;gap:16px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:16px}
    .foto-box{width:130px;height:130px;border-radius:10px;border:2px solid #e2e8f0;overflow:hidden;flex-shrink:0;background:#f1f5f9;display:flex;align-items:center;justify-content:center}
    .foto-box img{width:100%;height:100%;object-fit:cover}
    .foto-box .no-foto{font-size:9px;color:#94a3b8;text-align:center;padding:10px}
    .foto-info h3{font-size:12px;font-weight:800;color:#1e293b;margin-bottom:5px}
    .foto-info p{font-size:10px;color:#64748b;line-height:1.6}
    .foto-info .id-badge{margin-top:8px;display:inline-block;background:#0e5c33;color:#fff;font-size:9px;font-weight:800;padding:3px 10px;border-radius:20px;letter-spacing:0.5px}
    /* GPS link */
    .gps-link{font-size:9px;color:#2563eb;font-weight:700;text-decoration:underline}
    /* Legal */
    .legal{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px;margin-bottom:16px}
    .legal h3{font-size:10px;font-weight:800;color:#15803d;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px}
    .legal p{font-size:9px;color:#166534;line-height:1.7}
    /* Firmas */
    .firmas{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:16px}
    .firma-box{border-top:1.5px solid #cbd5e1;padding-top:8px}
    .firma-box p{font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px}
    /* Footer */
    .footer{border-top:1px solid #e2e8f0;padding-top:10px;display:flex;justify-content:space-between;align-items:center}
    .footer p{font-size:8px;color:#94a3b8}
    @media print{body{padding:18px 22px}.no-print{display:none}}
  </style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">
      <div class="logo"><span>Maíz</span></div>
      <div class="hdr-title">
        <h1>Constancia de Aceptación — Aviso de Privacidad</h1>
        <p>Plan Nacional Maíz 2026 · SADER · Sistema de Información de Mercados Agrícolas</p>
      </div>
    </div>
    <div class="hdr-right">
      <div class="badge">Aceptado · v${a.aviso_privacidad_version || '1.0'}</div>
      <p>Folio: #${String(a.id).padStart(6, '0')}</p>
      <p>Generado: ${new Date().toLocaleString('es-MX')}</p>
    </div>
  </div>

  <div class="comp-label">Completitud del registro: ${pct}%</div>
  <div class="comp-bar"><div class="comp-fill"></div></div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">Datos del Titular</div>
      <div class="field"><label>Nombre completo</label><value>${nomb}</value></div>
      <div class="field"><label>CURP</label><value class="mono">${a.curp}</value></div>
      <div class="field"><label>Teléfono</label><value>${a.telefono || '—'}</value></div>
      <div class="field"><label>Tipo de registro</label><value>${a.tipo.charAt(0).toUpperCase() + a.tipo.slice(1)}</value></div>
      <div class="field"><label>Estado de cuenta</label><value>${a.estado_validacion.charAt(0).toUpperCase() + a.estado_validacion.slice(1)}</value></div>
    </div>
    <div class="card">
      <div class="card-title">Registro de la Aceptación</div>
      <div class="field"><label>Fecha y hora exacta</label><value>${fmt(a.aviso_privacidad_fecha)}</value></div>
      <div class="field"><label>Coordenadas GPS</label><value class="mono">${coords}</value>${mapsURL ? `<a href="${mapsURL}" class="gps-link">Ver en mapa</a>` : ''}</div>
      <div class="field"><label>Versión del aviso</label><value>${a.aviso_privacidad_version || '1.0'}</value></div>
      <div class="field"><label>ID Registro</label><value>#${a.id}</value></div>
    </div>
  </div>

  <div class="foto-section">
    <div class="foto-box">
      ${foto
        ? `<img src="${foto}" alt="Verificación biométrica" crossorigin="anonymous"/>`
        : '<div class="no-foto">Sin fotografía capturada</div>'
      }
    </div>
    <div class="foto-info">
      <h3>Verificación Biométrica del Titular</h3>
      <p>La fotografía fue capturada automáticamente en el dispositivo del productor en el momento exacto de la aceptación del aviso de privacidad, constituyendo prueba fehaciente de la identidad del titular de la cuenta.</p>
      <p style="margin-top:6px">La imagen fue tomada con la cámara frontal del dispositivo y está asociada de forma inalterable al registro de aceptación con folio <strong>#${String(a.id).padStart(6, '0')}</strong>.</p>
      <div class="id-badge">ID: #${a.id} · ${a.tipo.toUpperCase()} · ${a.estado_validacion.toUpperCase()}</div>
    </div>
  </div>

  <div class="legal">
    <h3>Fundamento Legal</h3>
    <p>
      Esta constancia acredita que el titular identificado con CURP <strong>${a.curp}</strong> otorgó su consentimiento
      expreso para el tratamiento de sus datos personales, de conformidad con los Artículos 8, 9, 15 y 16 de la
      <strong>Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</strong>,
      y los Artículos 68 al 72 de su Reglamento. La aceptación fue registrada de manera electrónica con marca de
      tiempo certificada, coordenadas GPS del dispositivo del titular, y verificación biométrica facial. Este documento
      tiene plena validez legal como evidencia de consentimiento informado.
    </p>
  </div>

  <div class="firmas">
    <div class="firma-box">
      <p>Firma Digital del Titular</p>
      <p style="margin-top:4px;font-size:8px;color:#94a3b8">Consentimiento expresado electrónicamente</p>
    </div>
    <div class="firma-box">
      <p>Responsable del Tratamiento</p>
      <p style="margin-top:4px;font-size:8px;color:#94a3b8">SADER — Dirección de Información Agroalimentaria</p>
    </div>
  </div>

  <div class="footer">
    <p>Maíz — Plan Nacional Maíz 2026 · Secretaría de Agricultura y Desarrollo Rural · Documento generado automáticamente</p>
    <p>Folio #${String(a.id).padStart(6, '0')} · ${a.tipo.charAt(0).toUpperCase() + a.tipo.slice(1)} · ${new Date().toISOString()}</p>
  </div>

  <script>window.onload=()=>window.print()</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

/* ─── Exportar CSV ───────────────────────────────────────────────── */
function exportarCSV(lista: Aviso[]) {
  const cols = [
    'ID', 'Tipo', 'Nombre', 'CURP', 'Teléfono', 'Fecha Aceptación',
    'Latitud', 'Longitud', 'Versión', 'Foto URL', 'Estado', 'Completitud %',
  ];
  const rows = lista.map(a => [
    a.id, a.tipo.charAt(0).toUpperCase() + a.tipo.slice(1), nombre(a), a.curp, a.telefono || '',
    a.aviso_privacidad_fecha || '',
    a.aviso_privacidad_lat || '', a.aviso_privacidad_lng || '',
    a.aviso_privacidad_version || '', a.aviso_privacidad_foto_url || '',
    a.estado_validacion.charAt(0).toUpperCase() + a.estado_validacion.slice(1), completitud(a),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv  = [cols.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href  = URL.createObjectURL(blob);
  link.download = `avisos_privacidad_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ─── Foto con fallback ──────────────────────────────────────────── */
function FotoAviso({ src, className, size = 24 }: { src: string | null; className?: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <Camera size={size} className="text-gray-300" />;
  return <img src={src} alt="Verificación" className={className} onError={() => setErr(true)} />;
}

/* ─── Lightbox de foto ───────────────────────────────────────────── */
function FotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  // Bloquear scroll del body mientras está abierto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-8"
      style={{ zIndex: 99999 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
      <div
        className="relative w-full max-w-xs sm:max-w-sm md:max-w-md"
        style={{ zIndex: 100000 }}
        onClick={e => e.stopPropagation()}
      >
        <img
          src={src}
          alt="Verificación biométrica"
          className="w-full aspect-square object-cover rounded-3xl shadow-2xl"
        />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
        >
          <X size={16} className="text-gray-700" />
        </button>
        <p className="text-center text-white/60 text-[11px] font-medium mt-3">Verificación biométrica del titular</p>
      </div>
    </div>,
    document.body
  );
}

/* ─── Miniatura circular con lightbox ───────────────────────────── */
function FotoThumb({ src, size, thumbSize }: { src: string | null; size: number; thumbSize: string }) {
  const [open, setOpen] = useState(false);
  const hasPhoto = !!src;
  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); if (hasPhoto) setOpen(true); }}
        className={`${thumbSize} rounded-full overflow-hidden flex-shrink-0 bg-gray-100 border-2 flex items-center justify-center transition-all
          ${hasPhoto ? 'border-gray-200 cursor-pointer hover:border-emerald-400 hover:scale-105 active:scale-95' : 'border-gray-100 cursor-default'}`}
      >
        <FotoAviso src={src} className="w-full h-full object-cover" size={size} />
      </button>
      {open && src && <FotoLightbox src={src} onClose={() => setOpen(false)} />}
    </>
  );
}


/* ─── InfoCard para modal ────────────────────────────────────────── */
function InfoCard({ icon, label, value, mono = false, link = false }: {
  icon: React.ReactNode; label: string; value: string; mono?: boolean; link?: boolean;
}) {
  return (
    <div className={`bg-gray-50/80 rounded-2xl p-3.5 border border-gray-100 transition-colors ${link ? 'hover:border-emerald-200 hover:bg-emerald-50/50 cursor-pointer' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-[13px] font-semibold leading-snug ${link ? 'text-blue-600' : 'text-gray-800'} ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

/* ─── Modal detalle — estilo Apple 2026 ─────────────────────────── */
function edadDesdeCurp(curp: string): number | null {
  if (!curp || curp.length < 10) return null;
  const yy = parseInt(curp.substring(4, 6), 10);
  const mm = parseInt(curp.substring(6, 8), 10) - 1;
  const dd = parseInt(curp.substring(8, 10), 10);
  if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return null;
  const siglo = yy <= 30 ? 2000 : 1900;
  const nac = new Date(siglo + yy, mm, dd);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) edad--;
  return edad >= 0 && edad < 130 ? edad : null;
}

function ModalDetalle({ aviso, onClose }: { aviso: Aviso; onClose: () => void }) {
  const foto   = fotoURL(aviso.aviso_privacidad_foto_url);
  const nomb   = nombre(aviso);
  const coords = aviso.aviso_privacidad_lat && aviso.aviso_privacidad_lng;
  const pct    = completitud(aviso);
  const cap    = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const edad   = edadDesdeCurp(aviso.curp);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl max-h-[95dvh] sm:max-h-[88vh] flex flex-col overflow-hidden"
        style={{ boxShadow: '0 40px 80px -10px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Pull handle — mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-0 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Hero con foto */}
        {foto ? (
          <div className="relative flex-shrink-0 h-52 sm:h-60 overflow-hidden">
            <img src={foto} alt="Biométrico" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
            {/* Botón cerrar */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center hover:bg-black/55 active:scale-95 transition-all"
            >
              <X size={14} className="text-white" />
            </button>
            {/* Botón PDF */}
            <button
              onClick={() => generarPDF(aviso)}
              className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-sm hover:bg-white/35 active:scale-95 text-white rounded-full text-[11px] font-bold transition-all border border-white/25"
            >
              <FileDown size={11} /> PDF
            </button>
            {/* Nombre sobre la foto */}
            <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
              <p className="text-white font-extrabold text-[17px] leading-tight drop-shadow-sm">{nomb}</p>
              <p className="text-white/65 font-mono text-[10px] mt-0.5 tracking-wide">{aviso.curp}</p>
            </div>
          </div>
        ) : (
          /* Sin foto — header clásico */
          <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Camera size={20} className="text-gray-300" />
              </div>
              <div>
                <p className="font-extrabold text-gray-900 text-[15px] leading-tight">{nomb}</p>
                <p className="font-mono text-gray-400 text-[10px] mt-0.5">{aviso.curp}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => generarPDF(aviso)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-[12px] font-bold transition-all"
              >
                <FileDown size={12} /> PDF
              </button>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors">
                <X size={14} className="text-gray-500" />
              </button>
            </div>
          </div>
        )}

        {/* Cuerpo scrollable */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full border ${
              aviso.estado_validacion === 'activo'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${aviso.estado_validacion === 'activo' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {cap(aviso.estado_validacion)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              v{aviso.aviso_privacidad_version || '1.0'}
            </span>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full border ${
              aviso.tipo === 'productor' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>{cap(aviso.tipo)}</span>
            {edad !== null && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                {edad} años
              </span>
            )}
            {foto && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                <Fingerprint size={11} /> Biométrico
              </span>
            )}
          </div>

          {/* Barra completitud */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3.5 border border-gray-100">
            <div className="flex justify-between mb-2">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Completitud del registro</p>
              <span className={`text-[12px] font-black ${pct === 100 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-red-500'}`}>{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <InfoCard icon={<Phone size={13} className="text-emerald-500" />} label="Teléfono" value={aviso.telefono || '—'} />
            <InfoCard icon={<Hash size={13} className="text-emerald-500" />} label="Folio" value={`#${String(aviso.id).padStart(6,'0')}`} mono />
            <div className="col-span-2">
              <InfoCard icon={<Calendar size={13} className="text-emerald-500" />} label="Fecha y hora de aceptación" value={fmt(aviso.aviso_privacidad_fecha)} />
            </div>
            <div className="col-span-2">
              {coords ? (
                <a
                  href={`https://maps.google.com/?q=${aviso.aviso_privacidad_lat},${aviso.aviso_privacidad_lng}`}
                  target="_blank" rel="noopener noreferrer"
                >
                  <InfoCard icon={<MapPin size={13} className="text-emerald-500" />} label="Coordenadas GPS — toca para ver en mapa" value={`${aviso.aviso_privacidad_lat!.toFixed(6)}, ${aviso.aviso_privacidad_lng!.toFixed(6)}`} mono link />
                </a>
              ) : (
                <InfoCard icon={<MapPin size={13} className="text-gray-300" />} label="Coordenadas GPS" value="No disponible" />
              )}
            </div>
          </div>

          {/* Nota legal */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <p className="text-[10px] text-emerald-700 leading-relaxed">
              Registro con validez legal conforme a la <strong>LFPDPPP</strong>. Aceptación registrada con marca de tiempo, GPS y verificación biométrica. Folio <strong>#{String(aviso.id).padStart(6,'0')}</strong> · {cap(aviso.tipo)}.
            </p>
          </div>

          <div className="h-1" />
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Página principal ───────────────────────────────────────────── */
export default function AvisosPrivacidadAdminPage() {
  const [avisos,       setAvisos]       = useState<Aviso[]>([]);
  const [total,        setTotal]        = useState(0);
  const [totalGlobal,  setTotalGlobal]  = useState(0);
  const [statsFoto,    setStatsFoto]    = useState(0);
  const [statsGPS,     setStatsGPS]     = useState(0);
  const [statsComp,    setStatsComp]    = useState(0);
  const [cargando,     setCargando]     = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [busqueda,     setBusqueda]     = useState('');
  const [pagina,       setPagina]       = useState(1);
  const [seleccionado, setSeleccionado] = useState<Aviso | null>(null);
  const [vista,        setVista]        = useState<Vista>('tabla');
  const [seleccion,    setSeleccion]    = useState<Set<string>>(new Set());
  const [sortKey,      setSortKey]      = useState<SortKey>('fecha');
  const [sortDir,      setSortDir]      = useState<SortDir>('desc');
  const [filtros,      setFiltros]      = useState({ conFoto: false, conGPS: false, estado: '', tipo: '' });
  const [filtrosOpen,  setFiltrosOpen]  = useState(false);
  const [descargando,  setDescargando]  = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Carga de datos */
  const cargar = useCallback(async (q: string, pag: number, sk: SortKey, sd: SortDir) => {
    setCargando(true);
    setError(null);
    try {
      const offset = (pag - 1) * POR_PAG;
      const url = `${BASE}/admin/avisos-privacidad?q=${encodeURIComponent(q)}&limit=${POR_PAG}&offset=${offset}&sort=${sk}&dir=${sd}`;
      const res = await fetch(url, { headers: HDR() });
      if (!res.ok) throw new Error('Error al cargar avisos');
      const data = await res.json();
      setAvisos(data.avisos);
      setTotal(data.total);
      setTotalGlobal(data.total_global ?? data.total);
      setStatsFoto(data.con_foto ?? 0);
      setStatsGPS(data.con_gps ?? 0);
      setStatsComp(data.completitud_media ?? 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(busqueda, pagina, sortKey, sortDir); }, [pagina, sortKey, sortDir]);

  const onBusqueda = (val: string) => {
    setBusqueda(val); setPagina(1); setSeleccion(new Set());
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => cargar(val, 1, sortKey, sortDir), 300);
  };

  /* Filtrado client-side sobre la página actual */
  const avisosVis = avisos.filter(a => {
    if (filtros.conFoto && !a.aviso_privacidad_foto_url) return false;
    if (filtros.conGPS  && !a.aviso_privacidad_lat)     return false;
    if (filtros.estado  && a.estado_validacion !== filtros.estado) return false;
    if (filtros.tipo) {
      // 'productor' agrupa solo productor; 'bodeguero' agrupa bodega, industria, bodeguero
      if (filtros.tipo === 'productor' && a.tipo !== 'productor') return false;
      if (filtros.tipo === 'bodeguero' && !['bodega', 'industria', 'bodeguero'].includes(a.tipo)) return false;
    }
    return true;
  });

  /* Ordenamiento */
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setPagina(1);
  };

  /* Selección */
  const toggleSel = (id: string) => {
    setSeleccion(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleTodos = () => {
    if (seleccion.size === avisosVis.length) setSeleccion(new Set());
    else setSeleccion(new Set(avisosVis.map(a => a.id)));
  };

  /* Descargar todos CSV (todos los registros via API) */
  const descargarTodosCSV = async () => {
    setDescargando(true);
    try {
      const res = await fetch(`${BASE}/admin/avisos-privacidad?q=${encodeURIComponent(busqueda)}&limit=9999&offset=0`, { headers: HDR() });
      const data = await res.json();
      exportarCSV(data.avisos);
    } finally {
      setDescargando(false);
    }
  };

  /* Descargar PDFs seleccionados (secuencial con delay) */
  const descargarPDFsSeleccion = async () => {
    const lista = avisosVis.filter(a => seleccion.has(a.id));
    for (let i = 0; i < lista.length; i++) {
      generarPDF(lista[i]);
      if (i < lista.length - 1) await new Promise(r => setTimeout(r, 800));
    }
  };

  const totalPags  = Math.ceil(total / POR_PAG);
  const hayFiltros = filtros.conFoto || filtros.conGPS || !!filtros.estado || !!filtros.tipo;

  return (
    <>
      {seleccionado && <ModalDetalle aviso={seleccionado} onClose={() => setSeleccionado(null)} />}

      <div className="flex flex-col gap-3 h-full min-w-0 overflow-x-hidden">

        {/* ── Barra de acción ── */}
        <div className="bg-[#eef8f2] flex-shrink-0 rounded-b-2xl border border-[#1A5C38]/30 border-t-0 px-3 py-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#1A5C38]/70 uppercase tracking-wide">{total} registros totales</span>
        </div>

        {/* ── MÉTRICAS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric icon={<ShieldCheck size={18} />} label="Total aceptados" val={totalGlobal} color="emerald" />
          <Metric icon={<Fingerprint size={18} />} label="Con biométrico" val={statsFoto} of={totalGlobal} color="violet" />
          <Metric icon={<Globe size={18} />} label="Con GPS" val={statsGPS} of={totalGlobal} color="blue" />
          <Metric icon={<CheckCircle2 size={18} />} label="Completitud media" val={statsComp} suffix="%" color="amber" />
        </div>

        {/* ── BARRA DE HERRAMIENTAS ── */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">

          {/* Fila 1: Búsqueda ocupa todo el ancho en mobile */}
          <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-[160px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <Search size={14} className="text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={busqueda}
              onChange={e => onBusqueda(e.target.value)}
              placeholder="Buscar por nombre, CURP…"
              className="flex-1 min-w-0 text-[13px] text-gray-700 placeholder-gray-400 bg-transparent outline-none"
            />
            {cargando
              ? <Loader2 size={13} className="text-emerald-500 animate-spin flex-shrink-0" />
              : busqueda && <button onClick={() => onBusqueda('')}><X size={13} className="text-gray-400 hover:text-gray-600" /></button>
            }
          </div>

          {/* Fila 2 en mobile: controles en una línea */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Filtros */}
            <div className="relative">
              <button
                onClick={() => setFiltrosOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-bold transition-all ${
                  hayFiltros
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Filter size={13} />
                <span className="hidden xs:inline sm:inline">Filtros</span>
                {hayFiltros && <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] flex items-center justify-center font-black">
                  {[filtros.conFoto, filtros.conGPS, !!filtros.estado, !!filtros.tipo].filter(Boolean).length}
                </span>}
              </button>

              {filtrosOpen && (
                <div className="absolute top-full mt-1.5 left-0 z-30 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 w-64">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-3">Filtros activos</p>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Tipo de usuario</label>
                      <div className="flex gap-1.5">
                        {[
                          { val: '',           label: 'Todos' },
                          { val: 'productor',  label: 'Productor' },
                          { val: 'bodeguero',  label: 'Bodega' },
                        ].map(opt => (
                          <button
                            key={opt.val}
                            onClick={() => setFiltros(f => ({ ...f, tipo: opt.val }))}
                            className={`flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-all ${
                              filtros.tipo === opt.val
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                          >{opt.label}</button>
                        ))}
                      </div>
                    </div>
                    <FiltroCheck label="Solo con foto biométrica" checked={filtros.conFoto} onChange={v => setFiltros(f => ({ ...f, conFoto: v }))} />
                    <FiltroCheck label="Solo con GPS" checked={filtros.conGPS} onChange={v => setFiltros(f => ({ ...f, conGPS: v }))} />
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Estado de cuenta</label>
                      <select
                        value={filtros.estado}
                        onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}
                        className="w-full text-[12px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 outline-none"
                      >
                        <option value="">Todos</option>
                        <option value="activo">Activo</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="inactivo">Inactivo</option>
                      </select>
                    </div>
                  </div>
                  {hayFiltros && (
                    <button
                      onClick={() => setFiltros({ conFoto: false, conGPS: false, estado: '', tipo: '' })}
                      className="mt-3 text-[11px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                    >
                      <X size={11} /> Limpiar filtros
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Vista toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              <button onClick={() => setVista('tabla')}
                className={`p-1.5 rounded-lg transition-all ${vista === 'tabla' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
              ><TableProperties size={15} /></button>
              <button onClick={() => setVista('cards')}
                className={`p-1.5 rounded-lg transition-all ${vista === 'cards' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
              ><LayoutGrid size={15} /></button>
            </div>

            {/* Refresh */}
            <button
              onClick={() => cargar(busqueda, pagina, sortKey, sortDir)}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors flex-shrink-0"
            ><RefreshCw size={14} /></button>

            <div className="hidden sm:block h-6 w-px bg-gray-200" />

            {/* PDF seleccionados */}
            {seleccion.size > 0 && (
              <button
                onClick={descargarPDFsSeleccion}
                className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[12px] font-bold transition-all active:scale-95 shadow-sm shadow-violet-200"
              >
                <FileDown size={13} /> <span className="hidden sm:inline">PDF</span> ({seleccion.size})
              </button>
            )}

            {/* CSV */}
            <button
              onClick={descargarTodosCSV}
              disabled={descargando}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-[12px] font-bold transition-all active:scale-95 disabled:opacity-50"
            >
              {descargando ? <Loader2 size={13} className="animate-spin" /> : <ArrowDownToLine size={13} />}
              CSV
            </button>
          </div>
        </div>

        {/* ── CONTENIDO PRINCIPAL ── */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col min-h-0">
          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-12">
              <AlertTriangle size={32} className="text-red-400" strokeWidth={1.5} />
              <p className="text-[14px] font-bold text-gray-700">{error}</p>
              <button onClick={() => cargar(busqueda, pagina, sortKey, sortDir)} className="text-[12px] text-emerald-600 font-bold hover:underline">Reintentar</button>
            </div>
          ) : avisosVis.length === 0 && !cargando ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 py-16">
              <FileText size={40} strokeWidth={1.3} />
              <p className="text-[14px] font-semibold">
                {busqueda || hayFiltros ? 'Sin resultados para los filtros aplicados' : 'Aún no hay avisos de privacidad registrados'}
              </p>
              {(busqueda || hayFiltros) && (
                <button onClick={() => { onBusqueda(''); setFiltros({ conFoto: false, conGPS: false, estado: '', tipo: '' }); }}
                  className="text-[12px] text-emerald-600 font-bold hover:underline">Limpiar búsqueda</button>
              )}
            </div>
          ) : vista === 'tabla' ? (
            <>
              {/* Header tabla */}
              <div className="hidden sm:grid grid-cols-[auto_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
                <div className="flex items-center">
                  <button onClick={toggleTodos} className="text-gray-400 hover:text-emerald-600 transition-colors">
                    {seleccion.size === avisosVis.length && avisosVis.length > 0
                      ? <CheckSquare size={15} className="text-emerald-600" />
                      : <Square size={15} />
                    }
                  </button>
                </div>
                {([
                  ['nombre', 'Productor'],
                  ['fecha',  'Fecha aceptación'],
                  ['curp',   'CURP'],
                  ['estado', 'Estado'],
                ] as [SortKey, string][]).map(([k, lbl]) => (
                  <ColHeader key={k} label={lbl} sk={k} cur={sortKey} dir={sortDir} onClick={() => toggleSort(k)} />
                ))}
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wide self-center">Completitud</p>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wide self-center">Acciones</p>
              </div>

              {/* Filas */}
              <div className="flex-1 overflow-y-auto divide-y divide-gray-50/80">
                {cargando
                  ? Array.from({ length: 8 }).map((_, i) => <SkRow key={i} />)
                  : avisosVis.map(a => (
                    <FilaTabla
                      key={a.id}
                      aviso={a}
                      sel={seleccion.has(a.id)}
                      onToggleSel={() => toggleSel(a.id)}
                      onVer={() => setSeleccionado(a)}
                      onPDF={() => generarPDF(a)}
                    />
                  ))
                }
              </div>
            </>
          ) : (
            /* Vista cards — overflow en wrapper, grid en hijo */
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {cargando
                  ? Array.from({ length: 6 }).map((_, i) => <SkCard key={i} />)
                  : avisosVis.map(a => (
                    <Card
                      key={a.id}
                      aviso={a}
                      sel={seleccion.has(a.id)}
                      onToggleSel={() => toggleSel(a.id)}
                      onVer={() => setSeleccionado(a)}
                      onPDF={() => generarPDF(a)}
                    />
                  ))
                }
              </div>
            </div>
          )}

          {/* Paginación */}
          {totalPags > 1 && (
            <div className="px-3 sm:px-4 py-2.5 border-t border-gray-100 flex items-center justify-between gap-2 flex-shrink-0 bg-white min-w-0">
              <p className="text-[11px] text-gray-400 font-medium flex-shrink-0">
                <span className="hidden sm:inline">{(pagina - 1) * POR_PAG + 1}–{Math.min(pagina * POR_PAG, total)} de </span>
                <span className="font-bold text-gray-600">{total}</span>
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPagina(1)} disabled={pagina === 1}
                  className="hidden sm:flex px-2 py-1.5 rounded-lg border border-gray-200 text-[11px] font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">1</button>
                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                  <ChevronLeft size={13} /></button>
                <span className="text-[12px] font-black text-gray-700 px-1 whitespace-nowrap">{pagina} / {totalPags}</span>
                <button onClick={() => setPagina(p => Math.min(totalPags, p + 1))} disabled={pagina === totalPags}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                  <ChevronRight size={13} /></button>
                <button onClick={() => setPagina(totalPags)} disabled={pagina === totalPags}
                  className="hidden sm:flex px-2 py-1.5 rounded-lg border border-gray-200 text-[11px] font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">{totalPags}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cerrar filtros al hacer clic fuera */}
      {filtrosOpen && <div className="fixed inset-0 z-20" onClick={() => setFiltrosOpen(false)} />}
    </>
  );
}

/* ─── Sub-componentes ────────────────────────────────────────────── */

function Metric({ icon, label, val, of: ofVal, suffix, color }: {
  icon: React.ReactNode; label: string; val: number; of?: number; suffix?: string; color: string;
}) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-500',
    violet:  'bg-violet-50 border-violet-100 text-violet-500',
    blue:    'bg-blue-50 border-blue-100 text-blue-500',
    amber:   'bg-amber-50 border-amber-100 text-amber-500',
  };
  const cls = map[color] || map.emerald;
  return (
    <div className={`rounded-2xl border p-4 ${cls.split(' ').slice(0,2).join(' ')}`}>
      <div className={`flex items-center gap-2 mb-2 ${cls.split(' ')[2]}`}>{icon}</div>
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide leading-tight mb-1">{label}</p>
      <p className="text-[26px] font-black text-gray-900 leading-none">
        {val}{suffix}
        {ofVal !== undefined && <span className="text-[12px] font-semibold text-gray-400 ml-1">/ {ofVal}</span>}
      </p>
    </div>
  );
}

function ColHeader({ label, sk, cur, dir, onClick }: {
  label: string; sk: SortKey; cur: SortKey; dir: SortDir; onClick: () => void;
}) {
  const active = sk === cur;
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wide transition-colors text-left ${active ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
    >
      {label}
      {active
        ? (dir === 'asc' ? <SortAsc size={11} /> : <SortDesc size={11} />)
        : <SortAsc size={11} className="opacity-30" />
      }
    </button>
  );
}

function FiltroCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label onClick={() => onChange(!checked)} className="flex items-center gap-2.5 cursor-pointer group">
      <div className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all ${checked ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 group-hover:border-emerald-400'}`}>
        {checked && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      <span className="text-[12px] font-semibold text-gray-700">{label}</span>
    </label>
  );
}

function FilaTabla({ aviso, sel, onToggleSel, onVer, onPDF }: {
  aviso: Aviso; sel: boolean; onToggleSel: () => void; onVer: () => void; onPDF: () => void;
}) {
  const foto  = fotoURL(aviso.aviso_privacidad_foto_url);
  const nomb  = nombre(aviso);
  const pct   = completitud(aviso);
  const hasGPS = aviso.aviso_privacidad_lat && aviso.aviso_privacidad_lng;

  return (
    <>
    <div className={`hidden sm:grid grid-cols-[auto_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] gap-2 px-4 py-3.5 items-center group transition-colors ${sel ? 'bg-emerald-50/60' : 'hover:bg-gray-50/60'}`}>
      {/* Checkbox */}
      <button onClick={onToggleSel} className="text-gray-300 hover:text-emerald-500 transition-colors">
        {sel ? <CheckSquare size={15} className="text-emerald-600" /> : <Square size={15} />}
      </button>

      {/* Productor */}
      <div className="flex items-center gap-2.5 min-w-0">
        <FotoThumb src={foto} size={13} thumbSize="w-8 h-8" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-gray-900 truncate">{nomb}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              aviso.tipo === 'productor'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>{aviso.tipo.charAt(0).toUpperCase() + aviso.tipo.slice(1)}</span>
            <p className="text-[10px] text-gray-400">{aviso.telefono || '—'}</p>
          </div>
        </div>
      </div>

      {/* Fecha */}
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-gray-800">{fmt(aviso.aviso_privacidad_fecha, true)}</p>
        <p className="text-[9px] text-gray-400 mt-0.5">v{aviso.aviso_privacidad_version || '1.0'}</p>
      </div>

      {/* CURP */}
      <p className="text-[10px] font-mono text-gray-500 truncate">{aviso.curp}</p>

      {/* Estado */}
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${
        aviso.estado_validacion === 'activo'
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${aviso.estado_validacion === 'activo' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        {aviso.estado_validacion.charAt(0).toUpperCase() + aviso.estado_validacion.slice(1)}
      </span>

      {/* Completitud */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-12">
          <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-1">
          {hasGPS && <MapPin size={10} className="text-emerald-500" />}
          {aviso.aviso_privacidad_foto_url && <Camera size={10} className="text-violet-500" />}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1">
        <Btn icon={<Eye size={13} />} title="Ver detalle" onClick={onVer} color="emerald" />
        <Btn icon={<Download size={13} />} title="PDF" onClick={onPDF} color="blue" />
      </div>
    </div>

    {/* Fila mobile */}
    <div
      className="sm:hidden flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors cursor-pointer"
      onClick={onVer}
    >
      <FotoThumb src={foto} size={14} thumbSize="w-10 h-10" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 truncate">{nomb}</p>
        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{aviso.telefono || aviso.curp.slice(0, 12) + '…'}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-[9px] font-bold px-2 py-1 rounded-full border ${
          aviso.estado_validacion === 'activo'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>{aviso.estado_validacion === 'activo' ? 'Activo' : 'Pendiente'}</span>
        <button
          onClick={e => { e.stopPropagation(); onPDF(); }}
          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-600 text-gray-400 flex items-center justify-center transition-colors"
        >
          <Download size={13} />
        </button>
        <ChevronRight size={14} className="text-gray-300" />
      </div>
    </div>
    </>
  );
}

function Card({ aviso, sel, onToggleSel, onVer, onPDF }: {
  aviso: Aviso; sel: boolean; onToggleSel: () => void; onVer: () => void; onPDF: () => void;
}) {
  const foto = fotoURL(aviso.aviso_privacidad_foto_url);
  const nomb = nombre(aviso);
  const pct  = completitud(aviso);

  return (
    <div className={`rounded-2xl border p-3.5 transition-all cursor-default min-w-0 overflow-hidden ${sel ? 'border-emerald-300 bg-emerald-50/40 shadow-sm shadow-emerald-100' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}`}>
      {/* Fila 1: checkbox + foto + nombre */}
      <div className="flex items-start gap-2 mb-2">
        <button onClick={onToggleSel} className="flex-shrink-0 text-gray-300 hover:text-emerald-500 transition-colors mt-0.5">
          {sel ? <CheckSquare size={14} className="text-emerald-600" /> : <Square size={14} />}
        </button>
        <FotoThumb src={foto} size={15} thumbSize="w-9 h-9" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-gray-900 leading-snug break-words">{nomb}</p>
          <p className="text-[9px] font-mono text-gray-400 mt-0.5 truncate">{aviso.curp.slice(0, 14)}…</p>
        </div>
      </div>

      {/* Fila 2: tipo + estado en la misma línea */}
      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
          aviso.tipo === 'productor'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-blue-50 text-blue-700 border-blue-200'
        }`}>{aviso.tipo.charAt(0).toUpperCase() + aviso.tipo.slice(1)}</span>
        <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
          aviso.estado_validacion === 'activo'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          <span className={`w-1 h-1 rounded-full flex-shrink-0 ${aviso.estado_validacion === 'activo' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {aviso.estado_validacion.charAt(0).toUpperCase() + aviso.estado_validacion.slice(1)}
        </span>
      </div>

      {/* Fecha + iconos GPS/foto */}
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-2.5 min-w-0">
        <Calendar size={10} className="flex-shrink-0" />
        <span className="truncate">{fmt(aviso.aviso_privacidad_fecha, true)}</span>
        <span className="ml-auto flex items-center gap-1 flex-shrink-0">
          {aviso.aviso_privacidad_lat && <MapPin size={10} className="text-emerald-500" />}
          {aviso.aviso_privacidad_foto_url && <Camera size={10} className="text-violet-500" />}
        </span>
      </div>

      {/* Barra completitud */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Completitud</span>
          <span className={`text-[9px] font-black ${pct === 100 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-red-500'}`}>{pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onVer} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 text-gray-600 text-[11px] font-bold border border-gray-200 hover:border-emerald-200 transition-all">
          <Eye size={12} /> Ver
        </button>
        <button onClick={onPDF} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-gray-600 text-[11px] font-bold border border-gray-200 hover:border-blue-200 transition-all">
          <Download size={12} /> PDF
        </button>
      </div>
    </div>
  );
}

function Btn({ icon, title, onClick, color }: { icon: React.ReactNode; title: string; onClick: () => void; color: string }) {
  const cls = color === 'emerald'
    ? 'hover:bg-emerald-50 hover:text-emerald-600'
    : 'hover:bg-blue-50 hover:text-blue-600';
  return (
    <button onClick={onClick} title={title}
      className={`w-7 h-7 rounded-lg bg-gray-100 ${cls} text-gray-500 flex items-center justify-center transition-colors`}
    >{icon}</button>
  );
}

function SkRow() {
  return (
    <div className="hidden sm:grid grid-cols-[auto_2fr_1.4fr_0.8fr_0.8fr_0.8fr_auto] gap-2 px-4 py-3.5 items-center animate-pulse">
      <div className="w-4 h-4 bg-gray-100 rounded" />
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-gray-100 rounded-full flex-shrink-0" />
        <div className="space-y-1.5 flex-1"><div className="h-3 bg-gray-100 rounded w-3/4" /><div className="h-2 bg-gray-100 rounded w-1/3" /></div>
      </div>
      <div className="h-3 bg-gray-100 rounded w-2/3" />
      <div className="h-3 bg-gray-100 rounded w-full" />
      <div className="h-5 bg-gray-100 rounded-full w-16" />
      <div className="h-1.5 bg-gray-100 rounded-full" />
      <div className="flex gap-1"><div className="w-7 h-7 bg-gray-100 rounded-lg" /><div className="w-7 h-7 bg-gray-100 rounded-lg" /></div>
    </div>
  );
}

function SkCard() {
  return (
    <div className="rounded-2xl border border-gray-200 p-4 animate-pulse space-y-3">
      <div className="flex gap-2.5">
        <div className="w-10 h-10 bg-gray-100 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-1.5"><div className="h-3 bg-gray-100 rounded w-3/4" /><div className="h-2 bg-gray-100 rounded w-1/2" /></div>
      </div>
      <div className="h-2 bg-gray-100 rounded w-2/3" />
      <div className="h-1.5 bg-gray-100 rounded-full" />
      <div className="flex gap-2"><div className="flex-1 h-8 bg-gray-100 rounded-xl" /><div className="flex-1 h-8 bg-gray-100 rounded-xl" /></div>
    </div>
  );
}


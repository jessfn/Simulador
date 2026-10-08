import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, ChevronRight, MapPin, Warehouse, Circle,
  List, Map as MapIcon, Search, X, Pencil, Clock, CheckCircle2,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { api } from "../services/api";
import { formatNum } from "../utils/format";

interface Bodega {
  id: number;
  nombre: string;
  municipio: string;
  estado: string;
  semaforo_compra: string;
  ocupacion_pct: number;
  stock_actual: number;
  capacidad_ton: number;
  latitud?: number;
  longitud?: number;
  asociacion_estatus?: string;
}

const greenDot = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;background:#1A5C38;border-radius:50%;border:2.5px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.4)"></div>',
  iconSize: [14, 14] as [number, number],
  iconAnchor: [7, 7] as [number, number],
});

const greenDotFocus = L.divIcon({
  className: "",
  html: '<div style="width:20px;height:20px;background:#1A5C38;border-radius:50%;border:3px solid white;box-shadow:0 0 0 4px rgba(26,92,56,0.4),0 2px 8px rgba(0,0,0,0.4)"></div>',
  iconSize: [20, 20] as [number, number],
  iconAnchor: [10, 10] as [number, number],
});

const semaforoMap: Record<string, { label: string; dot: string; badge: string }> = {
  verde:         { label: "Comprando",     dot: "text-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  amarillo:      { label: "Cap. limitada", dot: "text-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  rojo:          { label: "No compra",     dot: "text-red-500",     badge: "bg-red-50 text-red-700 border-red-200" },
  sin_actividad: { label: "Sin actividad", dot: "text-gray-400",    badge: "bg-[#f4fbf7] text-gray-600 border-gray-200" },
};

function MapFlyTo({ bodega }: { bodega: Bodega | null }) {
  const map = useMap();
  useEffect(() => {
    if (bodega?.latitud && bodega?.longitud && Math.abs(bodega.latitud) > 0.001) {
      map.flyTo([bodega.latitud, bodega.longitud], 14, { animate: true, duration: 1.2 });
    }
  }, [bodega, map]);
  return null;
}

export default function B05MisBodegas() {
  const [bodegas, setBodegas]                   = useState<Bodega[]>([]);
  const [pendientes, setPendientes]             = useState<Bodega[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [vista, setVista]                       = useState<"lista" | "mapa">("lista");
  const [query, setQuery]                       = useState("");
  const [focused, setFocused]                   = useState(false);
  const [mapFocus, setMapFocus]                 = useState<Bodega | null>(null);

  /* Estados para editar capacidad */
  const [bodegaEditando, setBodegaEditando]     = useState<Bodega | null>(null);
  const [nuevaCapacidad, setNuevaCapacidad]     = useState("");
  const [guardando, setGuardando]               = useState(false);
  const [errorEdit, setErrorEdit]               = useState<string | null>(null);
  const [exito, setExito]                       = useState(false);

  const searchRef   = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const navigate    = useNavigate();

  useEffect(() => {
    Promise.all([
      api.bodeguero.misBodegas(),
      api.bodeguero.misBodegasEstatus(),
    ])
      .then(([aprobadas, todas]: [any, any]) => {
        const aprobList: Bodega[] = Array.isArray(aprobadas) ? aprobadas : [];
        const todasList: Bodega[] = todas?.bodegas ?? [];
        const pendList = todasList.filter(b => b.asociacion_estatus === 'pendiente');
        setBodegas(aprobList);
        setPendientes(pendList);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const q = query.trim().toLowerCase();

  const filtered = q
    ? bodegas.filter(b =>
        b.nombre.toLowerCase().includes(q) ||
        b.municipio.toLowerCase().includes(q) ||
        b.estado.toLowerCase().includes(q)
      )
    : bodegas;

  const suggestions = q
    ? bodegas
        .filter(b =>
          b.nombre.toLowerCase().includes(q) ||
          b.municipio.toLowerCase().includes(q) ||
          b.estado.toLowerCase().includes(q)
        )
        .slice(0, 6)
    : [];

  const dropdownVisible =
    vista === "mapa" && focused && q.length > 0 && suggestions.length > 0;

  const selectBodega = useCallback((b: Bodega) => {
    setMapFocus(b);
    setQuery(b.nombre);
    setFocused(false);
    searchRef.current?.blur();
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    setMapFocus(null);
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current &&
        !searchRef.current.contains(e.target as Node)
      ) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* Abrir bottom sheet de edición */
  function abrirEdicion(b: Bodega) {
    setBodegaEditando(b);
    setNuevaCapacidad(String(b.capacidad_ton ?? ""));
    setErrorEdit(null);
    setExito(false);
    setTimeout(() => inputRef.current?.focus(), 120);
  }

  function cerrarEdicion() {
    setBodegaEditando(null);
    setNuevaCapacidad("");
    setErrorEdit(null);
    setExito(false);
  }

  async function guardarCapacidad() {
    if (!bodegaEditando || !nuevaCapacidad) return;
    setGuardando(true);
    setErrorEdit(null);
    try {
      await api.bodegas.capacidad(bodegaEditando.id, Number(nuevaCapacidad));
      setBodegas(prev =>
        prev.map(b =>
          b.id === bodegaEditando.id
            ? { ...b, capacidad_ton: Number(nuevaCapacidad) }
            : b
        )
      );
      setExito(true);
      setTimeout(cerrarEdicion, 1400);
    } catch (err: any) {
      setErrorEdit(err.message || "No se pudo actualizar la capacidad");
    } finally {
      setGuardando(false);
    }
  }

  const barColor = (p: number) =>
    p < 70 ? "bg-[#1A5C38]" : p < 90 ? "bg-amber-400" : "bg-red-500";

  return (
    <div className="w-full">

      {/* ── BANNER VERDE ── */}
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_8px_30px_rgba(26,92,56,0.25)] overflow-visible">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none opacity-60 rounded-b-3xl" />
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-3 pb-4 relative z-10">

          <div className="mb-3">
            <p className="text-[10px] font-bold text-green-300/80 uppercase tracking-widest mb-0.5">Módulo</p>
            <h1 className="text-[20px] sm:text-[22px] font-bold text-white leading-tight drop-shadow-sm">
              Mis Bodegas
            </h1>
            <p className="text-green-100/70 text-[12px] mt-0.5 font-medium">
              {loading
                ? "Cargando..."
                : vista === "lista" && q
                  ? `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}`
                  : `${bodegas.length} bodega${bodegas.length !== 1 ? "s" : ""} asociada${bodegas.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Toggle Lista / Mapa */}
          <div className="flex items-center w-full bg-white/10 backdrop-blur-sm rounded-2xl p-1 mb-2.5">
            <button
              onClick={() => { setVista("lista"); setQuery(""); setMapFocus(null); }}
              className={"flex-1 flex items-center justify-center gap-2 py-2 rounded-[14px] text-[13px] font-bold transition-all duration-300 " +
                (vista === "lista" ? "bg-white text-[#1A5C38] shadow-sm" : "text-white/75 hover:text-white hover:bg-white/10")}
            >
              <List size={14} /> Lista
            </button>
            <button
              onClick={() => { setVista("mapa"); setQuery(""); setMapFocus(null); }}
              className={"flex-1 flex items-center justify-center gap-2 py-2 rounded-[14px] text-[13px] font-bold transition-all duration-300 " +
                (vista === "mapa" ? "bg-white text-[#1A5C38] shadow-sm" : "text-white/75 hover:text-white hover:bg-white/10")}
            >
              <MapIcon size={14} /> Mapa
            </button>
          </div>

          {/* Buscador con dropdown en mapa */}
          <div className="relative" ref={dropdownRef}>
            <div className={"flex items-center gap-2.5 w-full bg-white/15 backdrop-blur-md rounded-2xl px-3.5 py-2.5 border transition-all duration-300 " +
              (focused ? "border-white/50 bg-white/20 shadow-[0_0_0_3px_rgba(255,255,255,0.08)]" : "border-white/10")}>
              <Search size={14} className={"flex-shrink-0 transition-colors duration-300 " + (focused ? "text-white" : "text-white/50")} />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); if (vista === "mapa") setMapFocus(null); }}
                onFocus={() => setFocused(true)}
                placeholder={vista === "lista" ? "Buscar bodega, municipio o estado..." : "Busca una bodega para enfocar en el mapa..."}
                className="flex-1 bg-transparent text-white placeholder-white/40 text-[13px] font-medium outline-none min-w-0"
              />
              {query && (
                <button onClick={clearSearch} className="flex-shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center active:opacity-70 hover:bg-white/30">
                  <X size={11} className="text-white" />
                </button>
              )}
            </div>

            {dropdownVisible && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 bg-white rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.18)] border border-black/[0.05] overflow-hidden">
                {suggestions.map((b, i) => {
                  const sem = semaforoMap[b.semaforo_compra] || semaforoMap.sin_actividad;
                  const hasCoords = b.latitud && b.longitud && Math.abs(b.latitud) > 0.001;
                  return (
                    <button
                      key={b.id}
                      onMouseDown={e => { e.preventDefault(); selectBodega(b); }}
                      className={"w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f4fbf7] " +
                        (i < suggestions.length - 1 ? "border-b border-gray-50" : "")}
                    >
                      <div className={"w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 " + (hasCoords ? "bg-[#1A5C38]/10" : "bg-[#eef8f2]")}>
                        <MapPin size={14} className={hasCoords ? "text-[#1A5C38]" : "text-gray-400"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 truncate leading-tight">{b.nombre}</p>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{b.municipio}, {b.estado}</p>
                      </div>
                      <span className={"text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 " + sem.badge}>
                        {sem.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── CONTENIDO ── */}
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 py-5">

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
          </div>
        )}

        {/* Banner bodegas pendientes de aprobación */}
        {!loading && pendientes.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
            <Clock size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-amber-800">
                {pendientes.length === 1 ? "1 bodega pendiente de aprobación" : `${pendientes.length} bodegas pendientes de aprobación`}
              </p>
              <p className="text-[11px] text-amber-600 mt-0.5">
                {pendientes.map(b => b.nombre).join(", ")}
              </p>
            </div>
          </div>
        )}

        {/* Vista Lista */}
        {vista === "lista" && !loading && (
          <>
            {filtered.length === 0 && q ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[#eef8f2] flex items-center justify-center">
                  <Search size={24} className="text-gray-300" />
                </div>
                <p className="font-semibold text-[15px] text-gray-600">Sin resultados</p>
                <p className="text-[13px] text-gray-400 text-center px-4">
                  No hay bodegas que coincidan con "{query}"
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filtered.map(b => {
                  const sem = semaforoMap[b.semaforo_compra] || semaforoMap.sin_actividad;
                  const pct = b.ocupacion_pct ?? 0;
                  return (
                    <div
                      key={b.id}
                      className="bg-white rounded-2xl border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-4 flex flex-col gap-3 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300"
                    >
                      {/* Nombre + semáforo */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[15px] text-gray-900 leading-tight">{b.nombre}</p>
                          <p className="text-[12px] text-gray-400 flex items-center gap-1 mt-0.5">
                            <MapPin size={11} className="flex-shrink-0" />
                            <span className="truncate">{b.municipio}, {b.estado}</span>
                          </p>
                        </div>
                        <span className={"flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 " + sem.badge}>
                          <Circle size={6} fill="currentColor" className={sem.dot} />
                          {sem.label}
                        </span>
                      </div>

                      {/* Barra de ocupación */}
                      <div>
                        <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                          <span className="font-medium">Ocupación {pct}%</span>
                          <span>{formatNum(b.stock_actual || 0)} / {formatNum(b.capacidad_ton || 0)} ton</span>
                        </div>
                        <div className="bg-[#eef8f2] rounded-full h-1.5 overflow-hidden">
                          <div
                            className={"h-full rounded-full transition-all " + barColor(pct)}
                            style={{ width: Math.min(pct, 100) + "%" }}
                          />
                        </div>
                      </div>

                      {/* Botón corregir capacidad — acción propia y visible */}
                      <button
                        type="button"
                        onClick={() => abrirEdicion(b)}
                        className="w-full flex items-center justify-center gap-1.5 border border-[#1A5C38]/30 bg-[#1A5C38]/[0.04] text-[#1A5C38] rounded-xl py-2 text-[12px] font-semibold active:bg-[#1A5C38]/10 transition-colors"
                      >
                        <Pencil size={12} />
                        Corregir capacidad de almacenamiento
                      </button>

                      {/* Acciones principales */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate("/maiz/bodega/mis-bodegas/" + b.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-[#1A5C38] text-white rounded-xl py-2.5 text-[13px] font-semibold active:opacity-80 transition-opacity"
                        >
                          Detalle <ChevronRight size={13} />
                        </button>
                        <button
                          onClick={() => navigate("/maiz/bodega/mis-bodegas/" + b.id + "/semaforo")}
                          className="flex-1 bg-[#eef8f2] text-gray-700 rounded-xl py-2.5 text-[13px] font-semibold active:opacity-70 transition-opacity"
                        >
                          Semáforo
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Vista Mapa */}
        {vista === "mapa" && !loading && (
          <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 540 }}>
            <MapContainer center={[23.6345, -102.5528]} zoom={5} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Esri"
              />
              <MapFlyTo bodega={mapFocus} />
              {bodegas
                .filter(b => b.latitud && b.longitud && Math.abs(b.latitud!) > 0.001)
                .map(b => {
                  const sem = semaforoMap[b.semaforo_compra] || semaforoMap.sin_actividad;
                  const isFocused = mapFocus?.id === b.id;
                  return (
                    <Marker key={b.id} position={[b.latitud!, b.longitud!]} icon={isFocused ? greenDotFocus : greenDot}>
                      <Popup>
                        <div style={{ minWidth: 180 }}>
                          <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 3px" }}>{b.nombre}</p>
                          <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 6px" }}>{b.municipio}, {b.estado}</p>
                          <p style={{ fontSize: 11, color: "#374151", margin: "0 0 4px" }}>
                            Stock: {formatNum(b.stock_actual || 0)} / {formatNum(b.capacidad_ton || 0)} ton
                          </p>
                          <p style={{ fontSize: 11, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: b.semaforo_compra === "verde" ? "#22c55e" : b.semaforo_compra === "amarillo" ? "#f59e0b" : b.semaforo_compra === "rojo" ? "#ef4444" : "#9ca3af" }} />
                            {sem.label}
                          </p>
                          <button
                            onClick={() => navigate("/maiz/bodega/mis-bodegas/" + b.id)}
                            style={{ width: "100%", background: "#1A5C38", color: "white", fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer" }}
                          >
                            Ver detalle
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
            </MapContainer>
          </div>
        )}

        {/* Estado vacío — sin bodegas aprobadas */}
        {!loading && bodegas.length === 0 && pendientes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-[#eef8f2] flex items-center justify-center">
              <Warehouse size={32} className="text-gray-300" />
            </div>
            <p className="font-semibold text-[16px] text-gray-700">Sin bodegas asociadas</p>
            <p className="text-[14px] text-gray-400 text-center px-6">
              Toca el botón + para agregar las bodegas que operas
            </p>
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate("/maiz/bodega/seleccionar")}
        className="fixed bottom-24 right-5 w-14 h-14 bg-[#1A5C38] text-white rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform z-10"
      >
        <Plus size={24} />
      </button>

      {/* ── BOTTOM SHEET — Corregir capacidad ── */}
      {bodegaEditando && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={e => { if (e.target === e.currentTarget) cerrarEdicion(); }}
        >
          <div
            className="bg-white w-full rounded-t-[24px] px-5 pt-4 space-y-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 28px)" }}
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto" />

            {/* Cabecera */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-gray-900 text-[17px] leading-tight">
                  Corregir capacidad
                </h2>
                <p className="text-[12px] text-gray-500 mt-0.5 truncate">
                  {bodegaEditando.nombre}
                </p>
              </div>
              <button
                type="button"
                onClick={cerrarEdicion}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 flex-shrink-0"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            {/* Dato actual */}
            <div className="bg-[#eef8f2] rounded-2xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 font-medium">Capacidad actual registrada</p>
                <p className="text-[20px] font-black text-[#1A5C38] leading-tight">
                  {formatNum(bodegaEditando.capacidad_ton)} <span className="text-[14px] font-semibold">ton</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-gray-500 font-medium">Stock actual</p>
                <p className="text-[16px] font-bold text-gray-700 leading-tight">
                  {formatNum(bodegaEditando.stock_actual)} <span className="text-[12px] font-semibold">ton</span>
                </p>
              </div>
            </div>

            {/* Input nueva capacidad */}
            <div>
              <label className="text-[13px] font-bold text-gray-700 mb-1.5 block">
                Nueva capacidad total (toneladas)
              </label>
              <input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                value={nuevaCapacidad}
                onChange={e => setNuevaCapacidad(e.target.value)}
                placeholder={`Mínimo ${formatNum(bodegaEditando.stock_actual)} ton`}
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3.5 text-[18px] font-bold text-gray-800 focus:outline-none focus:border-[#1A5C38] transition-colors"
              />
              <p className="text-[11px] text-gray-400 mt-1.5">
                No puede ser menor al stock que ya tienes almacenado ({formatNum(bodegaEditando.stock_actual)} ton).
              </p>
            </div>

            {/* Error */}
            {errorEdit && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                <p className="text-red-600 text-[13px] font-medium">{errorEdit}</p>
              </div>
            )}

            {/* Éxito */}
            {exito && (
              <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                <p className="text-green-700 text-[13px] font-bold">Capacidad actualizada correctamente</p>
              </div>
            )}

            {/* Botón guardar */}
            <button
              type="button"
              onClick={guardarCapacidad}
              disabled={!nuevaCapacidad || guardando || exito}
              className="w-full bg-[#1A5C38] text-white font-bold text-[15px] py-4 rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {guardando ? "Guardando…" : "Guardar nueva capacidad"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

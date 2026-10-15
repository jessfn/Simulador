import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '../../../services/api';
import { Estado, fmtFecha, fmtNum } from './compartido';

function Ajustar({ geoms }: { geoms: any[] }) {
  const map = useMap();
  useEffect(() => {
    try { const b = L.geoJSON(geoms as any).getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 17 }); } catch { /* sin geometría */ }
  }, [geoms, map]);
  return null;
}

const Dato = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div><dt className="text-slate-400 text-[11.5px] uppercase tracking-wide">{k}</dt><dd className="text-slate-800 font-medium text-[13.5px]">{v === null || v === undefined || v === '' ? '—' : v}</dd></div>
);
const Caja = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="bg-white rounded-2xl border border-slate-200 p-4"><h2 className="text-[14.5px] font-bold text-slate-800 mb-3">{titulo}</h2>{children}</section>
);
const si = (v: boolean | null | undefined) => (v === null || v === undefined ? '—' : v ? 'Sí' : 'No');

// Detalle de un productor de frijol: solo lectura, con parcelas en mapa e historial de cambios.
export default function FrijolProductorAdminPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setF(null); setError('');
    api.admin.frijol.productor(id!).then(setF).catch((e: Error) => setError(e.message || 'No se pudo cargar el productor.'));
  }, [id]);

  const volver = (
    <button onClick={() => navigate('/maiz/admin/frijol')} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-[#1A5C38] min-h-[40px]"><ArrowLeft size={16} /> Regresar a Frijol</button>
  );
  if (error) return <div className="p-6 space-y-3">{volver}<div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-[14px] px-4 py-3">{error}</div></div>;
  if (!f) return <div className="p-6">{volver}<div className="flex justify-center py-24"><Loader2 className="animate-spin text-[#1A5C38]" size={28} /></div></div>;

  const geoms = f.parcelas.map((p: any) => p.geom).filter(Boolean);
  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1100px] mx-auto">
      {volver}
      <header className="bg-white rounded-2xl border border-slate-200 p-5">
        <h1 className="text-[22px] font-bold text-slate-900">{[f.nombres, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')}</h1>
        <p className="font-mono text-[13px] text-slate-500 mt-0.5">{f.curp}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2"><Estado v={f.verificacion_identidad} e={f.estatus_registro} />
          <span className="text-[12.5px] text-slate-500">Alta {fmtFecha(f.fecha_alta)} · Técnico: {f.tecnico || '—'}{f.tipo_tecnico ? ` (${f.tipo_tecnico})` : ''}</span></div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Caja titulo="Datos personales">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Dato k="Sexo" v={f.sexo === 'H' ? 'Hombre' : f.sexo === 'M' ? 'Mujer' : null} /><Dato k="Nacimiento" v={f.fecha_nacimiento} />
            <Dato k="Teléfono" v={f.telefono} /><Dato k="Correo" v={f.correo} />
            <Dato k="Ubicación" v={[f.localidad, f.municipio, f.estado].filter(Boolean).join(', ')} />
          </dl>
        </Caja>
        <Caja titulo="Información complementaria">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Dato k="Parcelas declaradas" v={f.total_ups_declaradas} /><Dato k="Organización" v={f.organizacion} />
            <Dato k="Programas de la Secretaría" v={f.participa_programas_sader ? [f.programas_sader, f.programas_sader_otro].filter(Boolean).join(', ') : 'No participa'} />
            <Dato k="Seguro agrícola" v={[f.seguro_agricola, f.seguro_agricola_nombre].filter(Boolean).join(': ')} />
          </dl>
        </Caja>
      </div>

      <Caja titulo="Verificación de identidad">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <Dato k="Estado" v={<Estado v={f.verificacion_identidad} e={f.estatus_registro} />} /><Dato k="Intentos" v={f.verificacion_intentos} />
          <Dato k="Último intento" v={f.verificacion_ultimo_intento ? fmtFecha(f.verificacion_ultimo_intento) : 'Sin intentos posteriores'} /><Dato k="Estatus del registro" v={f.estatus_registro} />
        </dl>
      </Caja>

      <Caja titulo={`Parcelas (${f.parcelas.length})`}>
        {geoms.length > 0 && (
          <div className="rounded-xl overflow-hidden border border-slate-200 mb-3" style={{ height: 300 }}>
            <MapContainer center={[23.6, -102.5]} zoom={5} style={{ height: '100%', width: '100%' }}>
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {geoms.map((g: any, i: number) => <GeoJSON key={i} data={g} style={() => ({ color: '#1A5C38', weight: 2, fillColor: '#2f9e5f', fillOpacity: 0.35 })} />)}
              <Ajustar geoms={geoms} />
            </MapContainer>
          </div>
        )}
        <ul className="space-y-2.5">{f.parcelas.map((p: any) => (
          <li key={p.up_id} className="rounded-xl border border-slate-200 p-3">
            <p className="font-semibold text-slate-900 text-[14px]">{p.up_name} <span className="text-slate-400 font-normal">· ID {p.up_id}{p.numero_up && f.total_ups_declaradas ? ` · parcela ${p.numero_up} de ${f.total_ups_declaradas}` : ''}</span></p>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-2">
              <Dato k="Ubicación" v={[p.localidad, p.municipio, p.estado].filter(Boolean).join(', ')} /><Dato k="Documento" v={p.documento_propiedad} /><Dato k="Régimen" v={p.water_regime} />
              <Dato k="Superficie calculada" v={`${fmtNum(p.ha, 2)} ha`} /><Dato k="Superficie ajustada" v={p.ha_ajustada != null ? `${fmtNum(p.ha_ajustada, 2)} ha` : null} />
              <Dato k="Coordenadas" v={p.lat != null ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : null} />
            </dl>
          </li>))}
        </ul>
      </Caja>

      <Caja titulo="Semillas">
        <ul className="space-y-2">{f.parcelas.map((p: any) => (
          <li key={p.up_id} className="rounded-xl border border-slate-200 p-3 text-[13.5px]">
            <p className="font-semibold text-slate-900">{p.up_name}</p>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-2">
              <Dato k="Produce semillas" v={si(p.se_dedica_produccion_semillas)} /><Dato k="Ha trabajado con PROSEBIEN" v={si(p.trabajo_con_prosebien)} />
              <Dato k="Usará PROSEBIEN" v={si(p.usara_prosebien_pv)} /><Dato k="Cumple criterio" v={si(p.cumple_criterio_original)} />
            </dl>
          </li>))}
        </ul>
      </Caja>

      <Caja titulo={`Cultivos (${f.cultivos.length})`}>
        <ul className="space-y-2.5">{f.cultivos.map((c: any) => (
          <li key={c.cycle_crop_id} className="rounded-xl border border-slate-200 p-3">
            <p className="font-semibold text-slate-900 text-[14px]">{c.variedad} · {c.ciclo} · {fmtNum(c.ha_sembradas, 2)} ha</p>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-2">
              <Dato k="Siembra" v={c.fecha_siembra} /><Dato k="Cosecha estimada" v={c.fecha_cosecha_estimada} />
              <Dato k="Rendimiento esperado" v={c.rendimiento_esperado_t_ha != null ? `${c.rendimiento_esperado_t_ha} t/ha` : null} />
              <Dato k="Producción estimada" v={c.produccion_estimada_t != null ? `${fmtNum(c.produccion_estimada_t, 2)} t` : null} /><Dato k="Destino" v={c.destino} />
              <Dato k="Tipo de siembra" v={c.tipo_siembra} /><Dato k="Densidad" v={c.densidad_kg_ha != null ? `${c.densidad_kg_ha} kg/ha` : null} />
              <Dato k="Fertilizante" v={c.usa_fertilizante ? (c.tipos_fertilizante || 'Sí') : si(c.usa_fertilizante)} /><Dato k="Rotación" v={c.rotacion} />
              <Dato k="Observaciones" v={c.observaciones} />
              <Dato k="Capturado" v={c.capturado_en ? fmtFecha(c.capturado_en) : null} /><Dato k="Enviado" v={fmtFecha(c.created_at)} />
              <Dato k="Sin señal en la captura" v={si(c.hubo_desconexion)} />
            </dl>
          </li>))}
        </ul>
      </Caja>

      <Caja titulo={`Historial de cambios (${f.cambios.length})`}>
        {f.cambios.length === 0 ? <p className="text-[13px] text-slate-400">Sin cambios después del alta.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[13px]">
            <thead className="text-left text-[11.5px] uppercase tracking-wide text-slate-400"><tr><th className="py-1.5 pr-3">Fecha</th><th className="pr-3">Campo</th><th className="pr-3">Antes</th><th className="pr-3">Después</th><th>Quién</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{f.cambios.map((c: any) => (
              <tr key={c.id}><td className="py-2 pr-3 whitespace-nowrap text-slate-500">{fmtFecha(c.created_at)}</td><td className="pr-3 font-semibold">{c.campo}</td><td className="pr-3">{c.valor_anterior ?? '—'}</td><td className="pr-3">{c.valor_nuevo ?? '—'}</td><td>{c.quien}</td></tr>))}
            </tbody></table></div>
        )}
      </Caja>
    </div>
  );
}

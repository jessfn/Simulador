import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Receipt, Tag, Store, FileText, Warehouse, UserCircle2, Handshake } from 'lucide-react';
import { api } from '../services/api';

// Se retiró el acceso a "Precios de mercado" (/precios-mercado) para bodegas:
// exponía el precio promedio entre bodegas competidoras, lo cual facilita que
// se alineen o anticipen precios entre sí — señalado por COFECE. La página
// sigue existiendo para admin/gobierno, solo se quitó el acceso desde aquí.
// Ver plan de rediseño (Fase 0, punto 2).
const ACCIONES = [
  { icon: UserCircle2, label: 'Mi perfil',                    desc: 'Ver y editar tu cuenta',          path: '/perfil',         iconBg: 'bg-[#1A5C38]/[0.08]', iconColor: 'text-[#1A5C38]', primary: true },
  { icon: Tag,         label: 'Publicar precio del día',       desc: 'Precio diario al productor',      path: '/precio-diario',  iconBg: 'bg-emerald-50',        iconColor: 'text-emerald-600' },
  { icon: Receipt,     label: 'Historial de transacciones',    desc: 'Compras registradas',             path: '/transacciones',  iconBg: 'bg-blue-50',           iconColor: 'text-blue-600' },
  { icon: Store,       label: 'Tarifario de servicios',        desc: 'Precios de servicios',            path: '/tarifario',      iconBg: 'bg-purple-50',         iconColor: 'text-purple-600' },
  { icon: Warehouse,   label: 'Mis ventanillas',               desc: null,                              path: '/ventanillas',    iconBg: 'bg-orange-50',         iconColor: 'text-orange-500' },
  { icon: FileText,    label: 'Requerimientos de maíz',        desc: 'Notifica a productores',          path: '/senales/nueva',  iconBg: 'bg-cyan-50',           iconColor: 'text-cyan-600' },
  { icon: Handshake,   label: 'Propuestas disponibles',        desc: 'Oferta por maíz publicado',       path: '/propuestas-disponibles', iconBg: 'bg-lime-50',   iconColor: 'text-lime-600' },
];

export default function MasPage() {
  const navigate = useNavigate();
  const [ventCount, setVentCount] = useState<number | null>(null);

  useEffect(() => {
    api.ventanillas.list().then((r: any) => {
      setVentCount(Array.isArray(r) ? r.length : (r?.ventanillas?.length ?? 0));
    }).catch(() => {});
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 space-y-6">

      <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-3">Opciones</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ACCIONES.map(({ icon: Icon, label, desc, path, iconBg, iconColor, primary }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`w-full flex items-center gap-4 px-5 py-5 rounded-[1.5rem] border active:scale-[0.98] transition-all duration-300 text-left group/card
              ${primary
                ? 'bg-[#1A5C38] border-[#1A5C38] shadow-[0_4px_18px_rgba(26,92,56,0.25)] hover:shadow-[0_8px_28px_rgba(26,92,56,0.35)] hover:-translate-y-0.5'
                : 'bg-white border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:border-black/[0.08]'}`}
          >
            <span className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover/card:scale-110 group-hover/card:-rotate-3
              ${primary ? 'bg-white/20' : iconBg}`}>
              <Icon size={22} className={primary ? 'text-white' : iconColor} />
            </span>
            <div className="flex-1 min-w-0 transition-transform duration-300 group-hover/card:translate-x-0.5">
              <p className={`text-[15px] font-bold leading-tight ${primary ? 'text-white' : 'text-gray-900 group-hover/card:text-[#1A5C38] transition-colors'}`}>{label}</p>
              <p className={`text-[13px] font-medium mt-0.5 ${primary ? 'text-white/70' : 'text-gray-500'}`}>
                {desc !== null ? desc : (
                  ventCount != null && ventCount > 0
                    ? `${ventCount} ventanilla${ventCount !== 1 ? 's' : ''} activa${ventCount !== 1 ? 's' : ''}`
                    : 'Toca para configurar una ventanilla de apoyo'
                )}
              </p>
            </div>
            <ChevronRight size={18} className={`flex-shrink-0 transition-transform duration-300 group-hover/card:translate-x-1 ${primary ? 'text-white/60' : 'text-gray-300 group-hover/card:text-[#1A5C38]'}`} />
          </button>
        ))}
      </div>

      {/* Info app */}
      <div className="bg-white rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] px-5 py-5 flex items-center gap-4 transition-all duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group/card">
        <img src="/icono.png" alt="SIMAC" className="w-12 h-12 flex-shrink-0 rounded-[1.25rem] ring-1 ring-[#4ade80] transition-transform duration-300 group-hover/card:scale-110 shadow-sm" />
        <div className="transition-transform duration-300 group-hover/card:translate-x-1">
          <p className="text-[16px] font-black text-[#1A5C38] tracking-tight">SIMAC</p>
          <p className="text-[13px] text-gray-500 font-medium mt-0.5">Sistema de Ordenamiento · Maíz México</p>
        </div>
      </div>

    </div>
  );
}

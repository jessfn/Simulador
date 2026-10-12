import { PageHeaderTecnico } from '../../components/LayoutTecnico';

// Pantalla provisional mientras se construye cada paso del registro de Frijol.
export default function EnConstruccionPage({ titulo }: { titulo: string }) {
  return (
    <div>
      <PageHeaderTecnico title={titulo} back="/frijol/tecnico" />
      <p className="px-4 py-6 text-[15px] text-slate-500">Esta pantalla se habilita en el siguiente paso del módulo.</p>
    </div>
  );
}

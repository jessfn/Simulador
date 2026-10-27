import { PageHeaderTecnico } from '../../components/LayoutTecnico';
import { BandejaSolicitudes } from '../../components/solicitudes/SolicitudesCambio';

// T10 — Solicitudes de cambio de datos personales (técnico de frijol): por resolver y mis solicitudes.
export default function SolicitudesFrijolPage() {
  return (
    <div className="pb-8">
      <PageHeaderTecnico title="Solicitudes de cambio" subtitle="Datos personales de los productores" back="/frijol/tecnico" />
      <BandejaSolicitudes programa="frijol_afb" />
    </div>
  );
}

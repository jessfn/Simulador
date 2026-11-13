import { useEffect, useState } from 'react';
import { Polygon } from 'react-leaflet';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface Props {
  excluirUpIds?: (number | string)[];
}

const ESTILO = {
  color: '#94a3b8',
  fillColor: '#cbd5e1',
  fillOpacity: 0.22,
  weight: 1.2,
  dashArray: '3 6',
} as const;

export default function ParcelasExistentesLayer({ excluirUpIds = [] }: Props) {
  const [polys, setPolys] = useState<{ id: number; pos: [number, number][] }[]>([]);

  useEffect(() => {
    fetch(`${BASE}/ups/geometrias`)
      .then(r => r.ok ? r.json() : { ups: [] })
      .then(d => {
        const excluir = new Set(excluirUpIds.map(String));
        const resultado: { id: number; pos: [number, number][] }[] = [];
        for (const u of (d.ups || [])) {
          if (excluir.has(String(u.up_id))) continue;
          const g = u.geom_geojson;
          if (!g?.coordinates) continue;
          const ring: number[][] =
            g.type === 'MultiPolygon' ? g.coordinates[0]?.[0] : g.coordinates[0];
          if (!ring || ring.length < 3) continue;
          resultado.push({
            id: u.up_id,
            pos: ring.map(([ln, la]) => [la, ln] as [number, number]),
          });
        }
        setPolys(resultado);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {polys.map(p => (
        <Polygon
          key={p.id}
          positions={p.pos}
          pathOptions={ESTILO}
          interactive={false}
        />
      ))}
    </>
  );
}

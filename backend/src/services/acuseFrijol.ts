import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import path from 'path';

// Acuse de registro de frijol (PDF). Misma imagen institucional que el acuse de maíz; no lleva PIN ni datos de acceso.
const LOGOS_DIR = path.join(__dirname, '../../assets/logos');
const LOGOS = [
  { archivo: 'simac.png', ratio: 2142 / 734, alto: 32 },
  { archivo: 'agricultura.png', ratio: 3800 / 727, alto: 26 },
  { archivo: 'gobmex.png', ratio: 3795 / 1401, alto: 32 },
];
const VERDE = '#1A5C38';
const GRIS = '#4B5563';
const GRIS_CLARO = '#9CA3AF';

export interface DatosAcuseFrijol {
  cycleCropId: number;
  fechaRegistro: Date;
  productor: { nombre: string; curp: string; telefono: string | null };
  idParcela: number;
  parcela: string;
  ubicacion: string;
  superficieParcelaHa: number | null;
  ciclo: string;
  variedad: string;
  superficieSembradaHa: number;
  produccionEstimadaTon: number | null;
  tecnico: string;
  verificacionIdentidad: string;
}

const fmtFecha = (d: Date) => d.toLocaleString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
const num = (n: number | null, d = 2) => (n == null ? '—' : n.toLocaleString('es-MX', { maximumFractionDigits: d }));

export function generarAcuseFrijol(d: DatosAcuseFrijol): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'letter', margin: 56 });
  doc.rect(0, 0, doc.page.width, 8).fill(VERDE);

  const bandaAlto = Math.max(...LOGOS.map(l => l.alto));
  const ancho = doc.page.width - 112;
  const anchos = LOGOS.map(l => l.alto * l.ratio);
  const gap = (ancho - anchos.reduce((a, b) => a + b, 0)) / (LOGOS.length - 1);
  let x = 56;
  LOGOS.forEach((logo, i) => {
    try { doc.image(path.join(LOGOS_DIR, logo.archivo), x, 24 + (bandaAlto - logo.alto) / 2, { height: logo.alto }); } catch { /* sin logo no se rompe el acuse */ }
    x += anchos[i] + gap;
  });
  doc.moveTo(56, 68).lineTo(doc.page.width - 56, 68).strokeColor('#E5E7EB').lineWidth(1).stroke();
  doc.fillColor(GRIS).font('Helvetica').fontSize(9).text('Registro de productores de frijol — Alimentación para el Bienestar', 56, 76, { width: 500 });
  doc.moveTo(56, 98).lineTo(doc.page.width - 56, 98).strokeColor('#E5E7EB').lineWidth(1).stroke();

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(20).text('ACUSE DE REGISTRO — FRIJOL', 56, 118, { align: 'center' });
  const folio = `FRIJOL-${String(d.cycleCropId).padStart(6, '0')}`;
  doc.fillColor(GRIS).font('Helvetica').fontSize(10).text(`Folio: ${folio}`, 56, 148, { align: 'center' });

  let y = 186;
  const filaAlto = 26, etiquetaAncho = 170, valorX = 56 + etiquetaAncho, valorAncho = doc.page.width - 56 - valorX;
  const fila = (etiqueta: string, valor: string) => {
    doc.rect(56, y, doc.page.width - 112, filaAlto).fillAndStroke('#F9FAFB', '#E5E7EB');
    doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(9).text(etiqueta.toUpperCase(), 66, y + 9, { width: etiquetaAncho - 10 });
    doc.fillColor('#111827').font('Helvetica').fontSize(10.5).text(valor, valorX, y + 8, { width: valorAncho - 10 });
    y += filaAlto;
  };
  const titulo = (t: string) => { y += 10; doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text(t, 56, y); y += 20; };

  titulo('Productor');
  fila('Nombre', d.productor.nombre);
  fila('CURP', d.productor.curp);
  fila('Teléfono', d.productor.telefono || 'No registrado');
  fila('Identidad', d.verificacionIdentidad === 'verificada' ? 'Verificada' : d.verificacionIdentidad === 'pendiente' ? 'Pendiente de verificación' : 'Requiere corrección');

  titulo('Parcela');
  fila('ID de parcela', String(d.idParcela));
  fila('Nombre', d.parcela);
  fila('Ubicación', d.ubicacion);
  fila('Superficie de la parcela', `${num(d.superficieParcelaHa)} ha`);

  titulo('Cultivo de frijol');
  fila('Ciclo', d.ciclo);
  fila('Variedad', d.variedad);
  fila('Superficie sembrada', `${num(d.superficieSembradaHa)} ha`);
  fila('Producción estimada', d.produccionEstimadaTon == null ? '—' : `${num(d.produccionEstimadaTon)} t`);

  titulo('Registro');
  fila('Registrado por', d.tecnico);
  fila('Fecha de registro', fmtFecha(d.fechaRegistro));

  y += 18;
  doc.moveTo(56, y).lineTo(doc.page.width - 56, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
  y += 12;
  const codigo = crypto.createHash('sha256').update(`${d.cycleCropId}|${d.fechaRegistro.toISOString()}|frijol-acuse`).digest('hex').slice(0, 12).toUpperCase();
  doc.fillColor(GRIS_CLARO).font('Helvetica').fontSize(8.5).text(
    `Este acuse confirma que los datos anteriores fueron registrados en la plataforma SIMAC (módulo Frijol) por el personal técnico indicado. ` +
    `No es un documento de apoyo ni garantiza su otorgamiento. Código de verificación: ${codigo}.`,
    56, y, { width: doc.page.width - 112, align: 'justify' }
  );
  return doc;
}

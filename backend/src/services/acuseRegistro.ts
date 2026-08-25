import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import path from 'path';

const LOGOS_DIR = path.join(__dirname, '../../assets/logos');
// Relación ancho/alto real de cada PNG — pdfkit escala por altura, pero
// necesitamos el ancho resultante de antemano para acomodar el siguiente
// logo en la fila sin traslaparse.
const LOGOS = [
  { archivo: 'simac.png', ratio: 2142 / 734 },
  { archivo: 'agricultura.png', ratio: 3800 / 727 },
  { archivo: 'gobmex.png', ratio: 3795 / 1401 },
];

interface DatosAcuse {
  usuarioId: number;
  nombreCompleto: string;
  curp: string | null;
  email: string | null;
  telefono: string | null;
  rol: string;
  fechaRegistro: Date;
  extra?: string[];
}

const VERDE = '#1A5C38';
const GRIS = '#4B5563';
const GRIS_CLARO = '#9CA3AF';

function rolLegible(rol: string): string {
  if (rol === 'productor') return 'Productor';
  if (rol === 'bodeguero') return 'Bodega / Centro de acopio';
  if (rol === 'admin' || rol === 'responsable') return 'Administrador';
  return 'Usuario';
}

function fmtFechaLarga(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
}

function fmtFechaHora(d: Date): string {
  return d.toLocaleString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'America/Mexico_City',
  });
}

function folio(rol: string, usuarioId: number): string {
  const prefijo = rol === 'productor' ? 'PROD' : rol === 'bodeguero' ? 'BOD' : 'USR';
  return `SIMAC-${prefijo}-${String(usuarioId).padStart(6, '0')}`;
}

/** Código corto de verificación — no es criptográficamente sensible, solo
 * da al documento un elemento de folio único no adivinable a simple vista. */
function codigoVerificacion(usuarioId: number, fechaRegistro: Date): string {
  const hash = crypto.createHash('sha256').update(`${usuarioId}|${fechaRegistro.toISOString()}|simac-acuse`).digest('hex');
  return hash.slice(0, 12).toUpperCase();
}

export function generarAcuseRegistro(datos: DatosAcuse): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'letter', margin: 56 });
  const ahora = new Date();

  // ── Encabezado ──────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 8).fill(VERDE);

  // Logos institucionales, de izquierda a derecha: sistema (SIMAC) →
  // dependencia (Secretaría de Agricultura) → gobierno federal.
  const logoAlto = 32;
  const logoGap = 18;
  let logoX = 56;
  for (const logo of LOGOS) {
    const ancho = logoAlto * logo.ratio;
    try {
      doc.image(path.join(LOGOS_DIR, logo.archivo), logoX, 24, { height: logoAlto });
    } catch { /* si el archivo no está disponible, no romper el acuse */ }
    logoX += ancho + logoGap;
  }

  doc.moveTo(56, 68).lineTo(doc.page.width - 56, 68).strokeColor('#E5E7EB').lineWidth(1).stroke();

  doc.fillColor(GRIS).font('Helvetica').fontSize(9)
    .text('Sistema de Ordenamiento de la Producción y Comercialización del Maíz Blanco en México', 56, 76, { width: 500 });
  doc.fillColor(GRIS_CLARO).fontSize(8).text('Plan Nacional Maíz 2026', 56, 90);

  doc.moveTo(56, 112).lineTo(doc.page.width - 56, 112).strokeColor('#E5E7EB').lineWidth(1).stroke();

  // ── Título ──────────────────────────────────────────────────
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(20).text('ACUSE DE REGISTRO', 56, 132, { align: 'center' });
  doc.fillColor(GRIS).font('Helvetica').fontSize(10)
    .text(`Folio: ${folio(datos.rol, datos.usuarioId)}`, 56, 160, { align: 'center' });

  let y = 202;
  const filaAlto = 28;
  const etiquetaAncho = 170;
  const valorX = 56 + etiquetaAncho;
  const valorAncho = doc.page.width - 56 - valorX;

  function fila(etiqueta: string, valor: string) {
    doc.rect(56, y, doc.page.width - 112, filaAlto).fillAndStroke('#F9FAFB', '#E5E7EB');
    doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(9.5).text(etiqueta.toUpperCase(), 66, y + 9, { width: etiquetaAncho - 10 });
    doc.fillColor('#111827').font('Helvetica').fontSize(10.5).text(valor, valorX, y + 8, { width: valorAncho - 10 });
    y += filaAlto;
  }

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Datos del registro', 56, y);
  y += 22;

  fila('Nombre completo', datos.nombreCompleto || 'No registrado');
  fila('CURP', datos.curp || 'No registrado');
  fila('Tipo de cuenta', rolLegible(datos.rol));
  fila('Correo electrónico', datos.email || 'No registrado');
  fila('Teléfono', datos.telefono || 'No registrado');
  fila('Fecha de registro en SIMAC', fmtFechaLarga(datos.fechaRegistro));

  if (datos.extra?.length) {
    y += 14;
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Información adicional', 56, y);
    y += 22;
    for (const linea of datos.extra) {
      doc.fillColor(GRIS).font('Helvetica').fontSize(10).text(`•  ${linea}`, 56, y, { width: doc.page.width - 112 });
      y += 18;
    }
  }

  // ── Nota legal ──────────────────────────────────────────────
  y += 20;
  doc.moveTo(56, y).lineTo(doc.page.width - 56, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
  y += 14;
  doc.fillColor(GRIS_CLARO).font('Helvetica').fontSize(8.5).text(
    'Este acuse confirma que los datos anteriores se encontraban registrados en la plataforma SIMAC al momento de su ' +
    'generación. Es un comprobante interno de la plataforma y no constituye, por sí mismo, una constancia oficial de ' +
    'programas de apoyo gubernamentales. Cualquier discrepancia con la información oficial deberá aclararse directamente ' +
    'con el equipo de soporte de SIMAC.',
    56, y, { width: doc.page.width - 112, align: 'justify' }
  );

  // ── Pie ─────────────────────────────────────────────────────
  // Debe quedar dentro del margen inferior (56pt) o PDFKit crea una
  // segunda página en blanco al intentar respetar el cuadro de texto.
  const pieY = doc.page.height - 130;
  doc.moveTo(56, pieY).lineTo(doc.page.width - 56, pieY).strokeColor('#E5E7EB').lineWidth(1).stroke();
  doc.fillColor(GRIS).font('Helvetica').fontSize(8.5)
    .text(`Documento generado el ${fmtFechaHora(ahora)}`, 56, pieY + 10);
  doc.fillColor(GRIS_CLARO).fontSize(8)
    .text(`Código de verificación: ${codigoVerificacion(datos.usuarioId, datos.fechaRegistro)}`, 56, pieY + 24);
  doc.fillColor(GRIS_CLARO).fontSize(7.5)
    .text('SIMAC — Secretaría de Agricultura y Desarrollo Rural', 56, pieY + 40);

  doc.end();
  return doc;
}

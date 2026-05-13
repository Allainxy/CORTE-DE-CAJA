// ============================================================================
// K-BOTANAS · nomina-exports-pdf.js
// ============================================================================
// PDF de nómina formato recibo formal:
//   - Tamaño carta (Letter), landscape
//   - Header con logo textual K-BOTANAS estilizado (rojo/amarillo)
//   - Tabla completa con todos los vendedores en una lista
//   - Filas zebra amarillo/blanco
//   - Columna GARANTÍA destacada en azul
//   - Subtotales por ruta + TOTAL GENERAL
//   - Espacio en blanco para FIRMA
//
// Dependencia: pdfkit (npm install pdfkit)
// ============================================================================

const PDFDocument = require('pdfkit');

const COLORS = {
  red:        '#CC0000',
  redLight:   '#E74C3C',
  yellow:     '#FFF2CC',
  yellowAccent: '#F1C40F',
  blue:       '#5DADE2',
  blueDark:   '#2874A6',
  black:      '#000000',
  gray:       '#7F8C8D',
  grayLight:  '#ECF0F1',
  white:      '#FFFFFF',
};

// Columnas con anchos relativos (suman ~720 = ancho útil de landscape letter)
const COLS = [
  { key: 'ruta',           label: 'RUTA',       w: 38,  align: 'center' },
  { key: 'vendedor',       label: 'VENDEDOR',   w: 130, align: 'left'   },
  { key: 'ranking',        label: 'RANK',       w: 32,  align: 'center' },
  { key: 'faltas',         label: 'FALT',       w: 32,  align: 'center' },
  { key: 'ventas',         label: 'VENTAS',     w: 60,  align: 'right', money: true },
  { key: 'comision_pct',   label: '%',          w: 36,  align: 'right', pct: true   },
  { key: 'comision_total', label: 'COMISIÓN',   w: 58,  align: 'right', money: true },
  { key: 'sueldo_base',    label: 'SUELDO',     w: 56,  align: 'right', money: true },
  { key: 'meta',           label: 'META',       w: 44,  align: 'right', money: true },
  { key: 'ranging',        label: 'RANGING',    w: 50,  align: 'right', money: true },
  { key: 'desc',           label: 'DESC',       w: 44,  align: 'right', money: true },
  { key: 'total',          label: 'TOTAL',      w: 56,  align: 'right', money: true },
  { key: 'garantia',       label: 'GARANTÍA',   w: 60,  align: 'right', money: true, highlight: true },
  { key: 'firma',          label: 'FIRMA',      w: 76,  align: 'center' },
];

function buildPdf({ periodo, pagos }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'landscape',
        margin: 28,
        info: {
          Title: `Nómina K-BOTANAS ${periodo.fecha_fin || ''}`,
          Author: 'K-BOTANAS ERP',
          Subject: 'Recibo de nómina semanal',
        }
      });

      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;
      const H = doc.page.height;
      const M = 28;

      // ----- HEADER (logo + título) -----
      drawHeader(doc, periodo, M, W);

      // ----- TABLA -----
      let y = 92;
      y = drawTable(doc, pagos, M, y, H);

      // ----- FOOTER (totales generales + firma) -----
      drawFooter(doc, pagos, M, y, W);

      doc.end();
    } catch (e) { reject(e); }
  });
}

// ============================================================================
// HEADER con logo textual
// ============================================================================
function drawHeader(doc, periodo, M, W) {
  // Banda roja superior
  doc.rect(M, M, W - 2 * M, 28).fill(COLORS.red);

  // Logo textual K-BOTANAS (lado izquierdo)
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(20)
     .text('K-BOTANAS', M + 14, M + 5, { lineBreak: false });

  // Pico amarillo decorativo
  doc.fontSize(11).fillColor(COLORS.yellowAccent)
     .text('· NÓMINA SEMANAL ·', M + 145, M + 9, { lineBreak: false });

  // Texto periodo (lado derecho)
  doc.fontSize(9).fillColor(COLORS.white);
  const periodoTxt = `Periodo: ${periodo.fecha_inicio || ''} al ${periodo.fecha_fin || ''}`;
  doc.text(periodoTxt, M, M + 8, { width: W - 2 * M - 14, align: 'right' });

  if (periodo.semana_comisiones_inicio) {
    doc.fontSize(8).text(
      `Comisiones S-1: ${periodo.semana_comisiones_inicio} al ${periodo.semana_comisiones_fin}`,
      M, M + 18, { width: W - 2 * M - 14, align: 'right' }
    );
  }

  // Banda amarilla decorativa
  doc.rect(M, M + 28, W - 2 * M, 4).fill(COLORS.yellowAccent);
}

// ============================================================================
// TABLA principal con encabezados y filas
// ============================================================================
function drawTable(doc, pagos, M, yStart, H) {
  const ROW_H = 16;
  const HEADER_H = 22;

  let y = yStart;

  // Encabezados
  drawTableHeader(doc, M, y, HEADER_H);
  y += HEADER_H;

  const grupos = agruparPorRuta(pagos);
  let zebra = false;

  for (const grupo of grupos) {
    // Filas del grupo
    for (const pago of grupo.pagos) {
      // ¿hay espacio? Si no, salto de página
      if (y + ROW_H > H - 90) {
        doc.addPage();
        y = M + 4;
        drawTableHeader(doc, M, y, HEADER_H);
        y += HEADER_H;
      }

      drawRow(doc, mapPagoToRow(pago), M, y, ROW_H, zebra);
      y += ROW_H;
      zebra = !zebra;
    }

    // Subtotal de ruta (si tiene más de 1 empleado)
    if (grupo.pagos.length > 1) {
      if (y + ROW_H > H - 90) { doc.addPage(); y = M + 4; }
      drawSubtotalRow(doc, `SUBTOTAL ${grupo.ruta}`, subtotal(grupo.pagos), M, y, ROW_H + 2);
      y += ROW_H + 2;
      zebra = false;
    }
  }

  return y + 4;
}

function drawTableHeader(doc, M, y, h) {
  let x = M;
  for (const col of COLS) {
    const bg = col.highlight ? COLORS.blueDark : COLORS.red;
    doc.rect(x, y, col.w, h).fill(bg);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7.5);
    doc.text(col.label, x + 2, y + 7, { width: col.w - 4, align: 'center' });
    x += col.w;
  }
}

function drawRow(doc, row, M, y, h, zebra) {
  let x = M;
  for (const col of COLS) {
    let bg = null;
    let textColor = COLORS.black;
    let bold = false;

    if (col.highlight) {
      bg = COLORS.blue;
      textColor = COLORS.white;
      bold = true;
    } else if (zebra) {
      bg = COLORS.yellow;
    }

    if (bg) doc.rect(x, y, col.w, h).fill(bg);
    // Borde fino
    doc.rect(x, y, col.w, h).strokeColor(COLORS.grayLight).lineWidth(0.4).stroke();

    const val = formatCell(row[col.key], col);
    doc.fillColor(textColor).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    doc.text(val, x + 2, y + 4, { width: col.w - 4, align: col.align, lineBreak: false, ellipsis: true });

    x += col.w;
  }
}

function drawSubtotalRow(doc, label, sub, M, y, h) {
  let x = M;
  // Primeras 4 columnas: merged como etiqueta del subtotal
  const labelW = COLS.slice(0, 4).reduce((s, c) => s + c.w, 0);
  doc.rect(x, y, labelW, h).fill(COLORS.redLight);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(8.5);
  doc.text(label, x + 4, y + 5, { width: labelW - 8, align: 'right', lineBreak: false });
  x += labelW;

  // Resto: valores de subtotal
  for (let i = 4; i < COLS.length; i++) {
    const col = COLS[i];
    const bg = col.highlight ? COLORS.blueDark : COLORS.redLight;
    doc.rect(x, y, col.w, h).fill(bg);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(8);
    const val = sub[col.key] !== undefined ? formatCell(sub[col.key], col) : '';
    doc.text(val, x + 2, y + 5, { width: col.w - 4, align: col.align, lineBreak: false });
    x += col.w;
  }
}

// ============================================================================
// FOOTER: total general + sección firma
// ============================================================================
function drawFooter(doc, pagos, M, yStart, W) {
  const sub = subtotal(pagos);
  let y = yStart + 8;

  const labelW = COLS.slice(0, 4).reduce((s, c) => s + c.w, 0);
  let x = M;

  // TOTAL GENERAL
  doc.rect(x, y, labelW, 26).fill(COLORS.black);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(11);
  doc.text('TOTAL GENERAL', x + 4, y + 8, { width: labelW - 8, align: 'right', lineBreak: false });
  x += labelW;

  for (let i = 4; i < COLS.length; i++) {
    const col = COLS[i];
    const bg = col.highlight ? COLORS.blueDark : COLORS.black;
    doc.rect(x, y, col.w, 26).fill(bg);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(8.5);
    const val = sub[col.key] !== undefined ? formatCell(sub[col.key], col) : '';
    doc.text(val, x + 2, y + 9, { width: col.w - 4, align: col.align, lineBreak: false });
    x += col.w;
  }
  y += 36;

  // Pie de página: fecha de impresión + nota
  doc.fillColor(COLORS.gray).font('Helvetica').fontSize(7);
  doc.text(
    `Generado: ${new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}  ·  ` +
    `K-BOTANAS ERP  ·  Confidencial — uso interno`,
    M, y, { width: W - 2 * M, align: 'center' }
  );
}

// ============================================================================
// HELPERS COMPARTIDOS
// ============================================================================

// Abreviaciones para departamentos largos (fix B3 — evita corte feo en PDF)
// R-XX (rutas de vendedores) se mantienen intactas
const DEPT_ABBR = {
  ADMINISTRACION: 'ADMIN',
  ALMACEN:        'ALMA',
  DULCERIA:       'DULC',
  ENVASADO:       'ENVS',
  GOMITAS:        'GOMI',
  CACAHUATE:      'CACA',
  CHOCOLATE:      'CHOC',
  PRODUCCION:     'PROD',
  MAQUILA:        'MAQ',
  VENTAS:         'VTAS',
};

// Devuelve etiqueta corta (≤6 chars) sin cortes feos: R-XX prevalece sobre todo,
// luego ruta_codigo, luego abreviación del departamento, finalmente slice como último recurso.
function rutaCorta(p) {
  if (p.ruta_codigo) return String(p.ruta_codigo).toUpperCase().slice(0, 6);
  const nombre = (p.ruta_nombre || '').toUpperCase().trim();
  if (!nombre) return p.empleado_tipo === 'VENDEDOR' ? 'S/R' : '-';
  if (DEPT_ABBR[nombre]) return DEPT_ABBR[nombre];
  // último recurso: primeras 5 letras + ‐  (sin cortar a la mitad de palabra si es posible)
  return nombre.slice(0, 5);
}

function mapPagoToRow(p) {
  const ventas         = num(p.ventas_semana || p.ventas || 0);
  const comisionTotal  = num(p.comisiones || p.comision_total || 0);
  const sueldoBase     = num(p.sueldo_base);
  const meta           = num(p.bono_meta);
  const ranging        = num(p.bono_ranking);
  const desc           = num(p.descuento_prestamos || 0) + num(p.descuento_faltas || 0);
  const total          = sueldoBase + comisionTotal + meta + ranging - desc;
  const garantia       = p.garantia !== null && p.garantia !== undefined ? num(p.garantia) : total;
  const comisionPct    = ventas > 0 ? (comisionTotal / ventas) : (p.porcentaje_comision || 0);

  return {
    ruta:           rutaCorta(p),
    vendedor:       (p.empleado_nombre || '').slice(0, 32),
    ranking:        p.ranking ? `#${p.ranking}` : '',
    faltas:         p.faltas || 0,
    ventas,
    comision_pct:   comisionPct,
    comision_total: comisionTotal,
    sueldo_base:    sueldoBase,
    meta,
    ranging,
    desc,
    total,
    garantia,
    firma:          '',
  };
}

function agruparPorRuta(pagos) {
  const map = new Map();
  for (const p of pagos) {
    const k = p.ruta_codigo || p.ruta_nombre || (p.empleado_tipo === 'VENDEDOR' ? 'SIN RUTA' : 'PLANTA');
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return Array.from(map.entries()).map(([ruta, pagos]) => ({ ruta, pagos }));
}

function subtotal(pagos) {
  const init = {
    ventas: 0, comision_total: 0, sueldo_base: 0, meta: 0,
    ranging: 0, desc: 0, total: 0, garantia: 0,
  };
  for (const p of pagos) {
    const row = mapPagoToRow(p);
    init.ventas         += row.ventas;
    init.comision_total += row.comision_total;
    init.sueldo_base    += row.sueldo_base;
    init.meta           += row.meta;
    init.ranging        += row.ranging;
    init.desc           += row.desc;
    init.total          += row.total;
    init.garantia       += row.garantia;
  }
  return init;
}

function formatCell(v, col) {
  if (v === null || v === undefined || v === '') return '';
  if (col.money) return formatMoney(v);
  if (col.pct)   return formatPct(v);
  return String(v);
}

function formatMoney(v) {
  const n = Number(v) || 0;
  if (n === 0) return '$0';
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(v) {
  const n = Number(v) || 0;
  if (n === 0) return '-';
  return (n * 100).toFixed(2) + '%';
}

function num(v) { return Number(v) || 0; }

module.exports = buildPdf;

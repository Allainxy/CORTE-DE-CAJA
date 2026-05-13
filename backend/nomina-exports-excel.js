// ============================================================================
// K-BOTANAS · nomina-exports-excel.js
// ============================================================================
// Genera el Excel de nómina replicando el formato del archivo de referencia:
//   - Filas alternadas amarillo (par) / blanco (impar)
//   - Columna GARANTÍA destacada en azul cielo
//   - Subtotales por ruta
//   - Header rojo con logo textual K-BOTANAS
//
// Estructura:
//   Hoja 1 "RECIBO NÓMINA"  → formato exacto del Excel de referencia
//   Hoja 2 "RESUMEN"         → KPIs del periodo
//   Hoja 3 "PRÉSTAMOS"        → préstamos activos
//
// Dependencia: exceljs (npm install exceljs)
// ============================================================================

const ExcelJS = require('exceljs');

// Paleta K-BOTANAS
const COLORS = {
  red:        'FFCC0000',   // rojo header
  yellow:     'FFFFF2CC',   // amarillo filas alternadas
  blue:       'FF5DADE2',   // azul cielo (columna GARANTÍA)
  blueDark:   'FF2874A6',   // azul oscuro header garantía
  white:      'FFFFFFFF',
  gray:       'FFE5E5E5',
  black:      'FF000000',
  green:      'FF27AE60',   // total positivo
};

const HEADERS = [
  { key: 'ruta',           label: 'RUTA',           width: 10 },
  { key: 'vendedor',       label: 'VENDEDOR',       width: 30 },
  { key: 'ranking',        label: 'RANKING',        width: 10 },
  { key: 'faltas',         label: 'FALTAS',         width: 10 },
  { key: 'ventas',         label: 'VENTAS',         width: 14 },
  { key: 'comision_pct',   label: 'COMISIÓN %',     width: 11 },
  { key: 'comision_total', label: 'COMISIÓN TOTAL', width: 15 },
  { key: 'sueldo_base',    label: 'SUELDO BASE',    width: 13 },
  { key: 'meta',           label: 'META',           width: 11 },
  { key: 'ranging',        label: 'RANGING',        width: 11 },
  { key: 'desc',           label: 'DESC',           width: 11 },
  { key: 'total',          label: 'TOTAL',          width: 13 },
  { key: 'garantia',       label: 'GARANTÍA',       width: 14, highlight: true },
  { key: 'firma',          label: 'FIRMA',          width: 18 },
];

async function buildExcel({ periodo, pagos, prestamos }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'K-BOTANAS ERP';
  wb.created = new Date();

  // ==========================================================================
  // HOJA 1: RECIBO NÓMINA
  // ==========================================================================
  const ws = wb.addWorksheet('RECIBO NÓMINA', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 4 }]
  });

  HEADERS.forEach((h, i) => { ws.getColumn(i + 1).width = h.width; });

  // Fila 1: título K-BOTANAS
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = 'K-BOTANAS · NÓMINA SEMANAL';
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.red } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 32;

  // Fila 2: periodo
  ws.mergeCells(2, 1, 2, HEADERS.length);
  const subCell = ws.getCell(2, 1);
  const periodoLabel = `Periodo: ${periodo.fecha_inicio || ''} al ${periodo.fecha_fin || ''}` +
    (periodo.semana_comisiones_inicio ? `  ·  Comisiones S-1: ${periodo.semana_comisiones_inicio} al ${periodo.semana_comisiones_fin}` : '');
  subCell.value = periodoLabel;
  subCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: COLORS.black } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 20;

  // Fila 3: vacía
  ws.getRow(3).height = 6;

  // Fila 4: encabezados
  const headerRow = ws.getRow(4);
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h.label;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.white } };
    cell.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: h.highlight ? COLORS.blueDark : COLORS.red }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top:    { style: 'thin', color: { argb: COLORS.black } },
      bottom: { style: 'thin', color: { argb: COLORS.black } },
      left:   { style: 'thin', color: { argb: COLORS.black } },
      right:  { style: 'thin', color: { argb: COLORS.black } },
    };
  });
  headerRow.height = 30;

  // Agrupar pagos por ruta para subtotales
  const grupos = agruparPorRuta(pagos);

  let currentRow = 5;
  let zebra = false;

  for (const grupo of grupos) {
    // Filas de empleados del grupo
    for (const pago of grupo.pagos) {
      const r = ws.getRow(currentRow);
      const valores = mapPagoToRow(pago);

      HEADERS.forEach((h, i) => {
        const cell = r.getCell(i + 1);
        cell.value = valores[h.key];
        cell.font = { name: 'Calibri', size: 10, color: { argb: COLORS.black } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: ['vendedor', 'ruta', 'firma'].includes(h.key) ? 'left' : 'right'
        };
        cell.border = {
          top:    { style: 'hair', color: { argb: COLORS.gray } },
          bottom: { style: 'hair', color: { argb: COLORS.gray } },
          left:   { style: 'hair', color: { argb: COLORS.gray } },
          right:  { style: 'hair', color: { argb: COLORS.gray } },
        };

        // Color de fondo
        if (h.highlight) {
          // Columna GARANTÍA siempre azul
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blue } };
          cell.font = { ...cell.font, bold: true, color: { argb: COLORS.white } };
        } else if (zebra) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.yellow } };
        }

        // Formato de moneda
        if (['ventas','comision_total','sueldo_base','meta','ranging','desc','total','garantia'].includes(h.key)) {
          cell.numFmt = '"$"#,##0.00';
        }
        if (h.key === 'comision_pct') {
          cell.numFmt = '0.00%';
        }
      });
      r.height = 22;
      currentRow++;
      zebra = !zebra;
    }

    // Subtotal del grupo (solo si grupo > 1 empleado)
    if (grupo.pagos.length > 1) {
      const r = ws.getRow(currentRow);
      r.getCell(1).value = `SUBTOTAL ${grupo.ruta}`;
      r.getCell(1).font = { bold: true, size: 10, color: { argb: COLORS.white } };
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.red } };
      r.getCell(1).alignment = { horizontal: 'right' };
      ws.mergeCells(currentRow, 1, currentRow, 4);

      const sub = subtotal(grupo.pagos);
      const subValores = {
        ventas: sub.ventas,
        comision_total: sub.comision_total,
        sueldo_base: sub.sueldo_base,
        meta: sub.meta,
        ranging: sub.ranging,
        desc: sub.desc,
        total: sub.total,
        garantia: sub.garantia,
      };
      HEADERS.forEach((h, i) => {
        if (i < 4) return; // ya merged
        const cell = r.getCell(i + 1);
        if (subValores[h.key] !== undefined) {
          cell.value = subValores[h.key];
          cell.numFmt = '"$"#,##0.00';
        }
        cell.font = { bold: true, size: 10, color: { argb: COLORS.white } };
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: h.highlight ? COLORS.blueDark : COLORS.red }
        };
        cell.alignment = { horizontal: 'right' };
      });
      r.height = 24;
      currentRow++;
      zebra = false;
    }
  }

  // Fila TOTAL GENERAL
  const totalGen = subtotal(pagos);
  const totalRow = ws.getRow(currentRow + 1);
  totalRow.getCell(1).value = 'TOTAL GENERAL';
  ws.mergeCells(currentRow + 1, 1, currentRow + 1, 4);
  HEADERS.forEach((h, i) => {
    const cell = totalRow.getCell(i + 1);
    cell.font = { bold: true, size: 12, color: { argb: COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.black } };
    cell.alignment = { horizontal: i < 4 ? 'right' : 'right' };
    if (i >= 4 && totalGen[h.key] !== undefined) {
      cell.value = totalGen[h.key];
      cell.numFmt = '"$"#,##0.00';
    }
  });
  totalRow.height = 30;

  // Footer (firma)
  const footerRow = currentRow + 4;
  ws.mergeCells(footerRow, 1, footerRow, 4);
  ws.getCell(footerRow, 1).value = `Generado: ${new Date().toLocaleString('es-MX')}`;
  ws.getCell(footerRow, 1).font = { italic: true, size: 9, color: { argb: COLORS.gray } };

  // ==========================================================================
  // HOJA 2: RESUMEN
  // ==========================================================================
  const ws2 = wb.addWorksheet('RESUMEN');
  ws2.columns = [{ width: 30 }, { width: 18 }];
  ws2.addRow(['RESUMEN PERIODO NÓMINA', '']);
  ws2.getRow(1).font = { bold: true, size: 14 };
  ws2.addRow([]);
  ws2.addRow(['Periodo', `${periodo.fecha_inicio} → ${periodo.fecha_fin}`]);
  ws2.addRow(['Empleados', pagos.length]);
  ws2.addRow(['Vendedores ruta', pagos.filter(p => p.empleado_tipo === 'VENDEDOR').length]);
  ws2.addRow(['Total ventas (S-1)', totalGen.ventas]);
  ws2.addRow(['Total comisiones', totalGen.comision_total]);
  ws2.addRow(['Total sueldos base', totalGen.sueldo_base]);
  ws2.addRow(['Total bonos meta', totalGen.meta]);
  ws2.addRow(['Total bonos ranking', totalGen.ranging]);
  ws2.addRow(['Total descuentos', totalGen.desc]);
  ws2.addRow(['TOTAL A PAGAR', totalGen.garantia || totalGen.total]);
  ws2.getRow(12).font = { bold: true, color: { argb: COLORS.blueDark } };
  for (let r = 6; r <= 12; r++) {
    ws2.getCell(r, 2).numFmt = '"$"#,##0.00';
  }

  // ==========================================================================
  // HOJA 3: PRÉSTAMOS
  // ==========================================================================
  const ws3 = wb.addWorksheet('PRÉSTAMOS ACTIVOS');
  ws3.columns = [
    { header: 'EMPLEADO',       key: 'nombre',    width: 30 },
    { header: 'MONTO ORIGINAL', key: 'original',  width: 16 },
    { header: 'ABONADO',        key: 'abonado',   width: 14 },
    { header: 'SALDO',          key: 'saldo',     width: 14 },
    { header: 'FECHA',          key: 'fecha',     width: 12 },
    { header: 'MOTIVO',         key: 'motivo',    width: 40 },
  ];
  ws3.getRow(1).font = { bold: true, color: { argb: COLORS.white } };
  ws3.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.red } };
  ws3.getRow(1).height = 22;

  for (const p of (prestamos || [])) {
    ws3.addRow({
      nombre: p.empleado_nombre,
      original: p.monto_original,
      abonado: (p.monto_original || 0) - (p.saldo || 0),
      saldo: p.saldo,
      fecha: p.fecha,
      motivo: p.motivo,
    });
  }
  for (let i = 2; i <= 4; i++) ws3.getColumn(i).numFmt = '"$"#,##0.00';

  // Return buffer
  return await wb.xlsx.writeBuffer();
}

// ============================================================================
// HELPERS
// ============================================================================
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
    ruta:           p.ruta_codigo || p.ruta_nombre || '-',
    vendedor:       p.empleado_nombre,
    ranking:        p.ranking || '',
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

function num(v) { return Number(v) || 0; }

module.exports = buildExcel;

// xml.js — Parser y generador XML para K-BOTANAS
window.KBotXML = (function () {

  // Genera XML a partir de movimientos
  function exportXML(movs) {
    const esc = (s) => String(s ?? '').replace(/[<>&"']/g, c => (
      { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
    ));
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<KBotanas version="1.0" generado="' + new Date().toISOString() + '">');
    lines.push('  <Movimientos count="' + movs.length + '">');
    for (const m of movs) {
      lines.push('    <Movimiento id="' + esc(m.id) + '">');
      lines.push('      <Fecha>' + esc(m.fecha) + '</Fecha>');
      lines.push('      <Tipo>' + esc(m.tipo) + '</Tipo>');
      lines.push('      <Categoria>' + esc(m.categoria) + '</Categoria>');
      lines.push('      <Concepto>' + esc(m.concepto || '') + '</Concepto>');
      lines.push('      <Monto>' + Number(m.monto).toFixed(2) + '</Monto>');
      lines.push('      <Metodo>' + esc(m.metodo || 'EFECTIVO') + '</Metodo>');
      lines.push('      <Caja>' + esc(m.caja || 'PRINCIPAL') + '</Caja>');
      lines.push('      <Usuario>' + esc(m.usuario || '') + '</Usuario>');
      lines.push('      <Notas>' + esc(m.notas || '') + '</Notas>');
      lines.push('    </Movimiento>');
    }
    lines.push('  </Movimientos>');
    lines.push('</KBotanas>');
    return lines.join('\n');
  }

  // Parser flexible: acepta el formato propio + intenta autodetectar campos comunes
  function parseXML(text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error('XML inválido: ' + err.textContent.slice(0, 80));

    const items = [];
    // Formato propio
    const movs = doc.querySelectorAll('Movimiento, movimiento, mov');
    if (movs.length) {
      movs.forEach(node => {
        items.push({
          id: getText(node, 'id') || node.getAttribute('id') || crypto.randomUUID(),
          fecha: getText(node, 'Fecha,fecha,date') || new Date().toISOString().slice(0, 10),
          tipo: (getText(node, 'Tipo,tipo,type') || 'GASTO').toUpperCase(),
          categoria: getText(node, 'Categoria,categoria,category') || 'OTROS',
          concepto: getText(node, 'Concepto,concepto,concept,descripcion,description') || '',
          monto: parseFloat(getText(node, 'Monto,monto,amount,total') || '0') || 0,
          metodo: getText(node, 'Metodo,metodo,method') || 'EFECTIVO',
          caja: getText(node, 'Caja,caja') || 'PRINCIPAL',
          usuario: getText(node, 'Usuario,usuario,user') || '',
          notas: getText(node, 'Notas,notas,notes') || '',
          src: 'xml'
        });
      });
      return items;
    }
    // Genérico — intenta cualquier nodo hijo de la raíz
    const root = doc.documentElement;
    Array.from(root.children).forEach(child => {
      Array.from(child.children).forEach(node => {
        const monto = parseFloat(getText(node, 'monto,amount,total,importe') || '0');
        if (!monto) return;
        items.push({
          id: crypto.randomUUID(),
          fecha: getText(node, 'fecha,date,Fecha') || new Date().toISOString().slice(0, 10),
          tipo: (getText(node, 'tipo,type') || 'GASTO').toUpperCase(),
          categoria: getText(node, 'categoria,category') || 'OTROS',
          concepto: getText(node, 'concepto,concept,descripcion') || node.tagName,
          monto,
          metodo: 'EFECTIVO',
          caja: 'PRINCIPAL',
          usuario: '',
          notas: '',
          src: 'xml'
        });
      });
    });
    return items;
  }

  function getText(node, names) {
    const list = names.split(',');
    for (const n of list) {
      const el = node.querySelector(n);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  }

  function download(text, filename) {
    const blob = new Blob([text], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { exportXML, parseXML, download };
})();

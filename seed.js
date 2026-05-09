// seed.js — Datos iniciales y categorías por defecto
window.KBotSeed = (function () {
  const CATS = [
    // INGRESOS
    { id: 'i-rutas', tipo: 'INGRESO', nombre: 'VENTAS RUTAS', color: '#2EC27E', icon: '🛻' },
    { id: 'i-dist', tipo: 'INGRESO', nombre: 'VENTA DISTRIBUIDOR', color: '#1AAB7A', icon: '📦' },
    { id: 'i-may', tipo: 'INGRESO', nombre: 'VENTA MAYOREO', color: '#3FB984', icon: '🏪' },
    { id: 'i-otros', tipo: 'INGRESO', nombre: 'OTROS INGRESOS', color: '#7BC97F', icon: '💵' },
    // GASTOS
    { id: 'g-gas', tipo: 'GASTO', nombre: 'GASOLINA', color: '#FF6B35', icon: '⛽' },
    { id: 'g-nom', tipo: 'GASTO', nombre: 'NOMINAS', color: '#E63946', icon: '👥' },
    { id: 'g-mer', tipo: 'GASTO', nombre: 'MERCANCIA', color: '#D62828', icon: '📥' },
    { id: 'g-pub', tipo: 'GASTO', nombre: 'PUBLICIDAD', color: '#FFB800', icon: '📣' },
    { id: 'g-pap', tipo: 'GASTO', nombre: 'PAPELERIA', color: '#F4A261', icon: '📄' },
    { id: 'g-ren', tipo: 'GASTO', nombre: 'RENTA', color: '#B5179E', icon: '🏠' },
    { id: 'g-ser', tipo: 'GASTO', nombre: 'SERVICIOS', color: '#7209B7', icon: '💡' },
    { id: 'g-otros', tipo: 'GASTO', nombre: 'OTROS GASTOS', color: '#8D6A4F', icon: '📌' },
  ];

  // Genera ~120 movimientos de muestra de los últimos 90 días
  function genSampleMovs() {
    const out = [];
    const today = new Date();
    const ingresos = CATS.filter(c => c.tipo === 'INGRESO');
    const gastos = CATS.filter(c => c.tipo === 'GASTO');
    const conceptosIng = {
      'VENTAS RUTAS': ['Ruta Centro', 'Ruta Norte', 'Ruta Sur', 'Ruta Oriente', 'Ruta Poniente'],
      'VENTA DISTRIBUIDOR': ['Distribuidor Pérez', 'Distribuidor López', 'Distribuidor González'],
      'VENTA MAYOREO': ['Tienda La Esquina', 'Abarrotes Don Juan', 'Súper El Ahorro'],
      'OTROS INGRESOS': ['Devolución envases', 'Venta caja vacía', 'Reembolso'],
    };
    const conceptosGas = {
      'GASOLINA': ['Pemex Av. Reforma', 'Pemex Carretera', 'Diesel camioneta'],
      'NOMINAS': ['Pago semanal Juan', 'Pago María', 'Pago Pedro', 'Bono ruta'],
      'MERCANCIA': ['Compra cacahuates', 'Compra chiles', 'Habas saladas', 'Pepitas'],
      'PUBLICIDAD': ['Lonas mercado', 'Volantes', 'Facebook ads'],
      'PAPELERIA': ['Tickets caja', 'Tinta impresora', 'Folders'],
      'RENTA': ['Renta bodega', 'Renta local'],
      'SERVICIOS': ['CFE luz', 'Agua potable', 'Internet Telmex', 'Teléfono'],
      'OTROS GASTOS': ['Mantenimiento', 'Limpieza', 'Imprevisto'],
    };

    let id = 1;
    for (let d = 89; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const iso = date.toISOString().slice(0, 10);
      const nIng = 2 + Math.floor(Math.random() * 4);
      const nGas = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < nIng; i++) {
        const c = ingresos[Math.floor(Math.random() * ingresos.length)];
        const conceptos = conceptosIng[c.nombre] || ['Venta'];
        out.push({
          id: 'm' + (id++).toString().padStart(5, '0'),
          fecha: iso,
          tipo: 'INGRESO',
          categoria: c.nombre,
          concepto: conceptos[Math.floor(Math.random() * conceptos.length)],
          monto: Math.round((500 + Math.random() * 8500) * 100) / 100,
          metodo: 'EFECTIVO',
          caja: 'PRINCIPAL',
          usuario: ['Ana', 'Luis', 'Carmen'][Math.floor(Math.random() * 3)],
          notas: '',
          src: 'manual'
        });
      }
      for (let i = 0; i < nGas; i++) {
        const c = gastos[Math.floor(Math.random() * gastos.length)];
        const conceptos = conceptosGas[c.nombre] || ['Gasto'];
        out.push({
          id: 'm' + (id++).toString().padStart(5, '0'),
          fecha: iso,
          tipo: 'GASTO',
          categoria: c.nombre,
          concepto: conceptos[Math.floor(Math.random() * conceptos.length)],
          monto: Math.round((150 + Math.random() * 4500) * 100) / 100,
          metodo: 'EFECTIVO',
          caja: 'PRINCIPAL',
          usuario: ['Ana', 'Luis', 'Carmen'][Math.floor(Math.random() * 3)],
          notas: '',
          src: 'manual'
        });
      }
    }
    return out;
  }

  return { CATS, genSampleMovs };
})();

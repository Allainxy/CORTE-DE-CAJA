// backend/lib/money.js — utilidades de dinero compartidas (testeables).
// Extraído de server.js para poder probarlo con node --test (semilla de #6/#7).

// Redondeo a centavos consistente (evita drift de punto flotante en sumas de dinero REAL).
const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

// updated_at lógico acotado: usa el sello del cliente si es válido, acotado contra
// relojes adelantados (SKEW ms); si no, cae al reloj del servidor (now).
function clampUpdatedAt(clientUpdatedAt, now, skewMs) {
  const ua = Number(clientUpdatedAt);
  return (Number.isFinite(ua) && ua > 0) ? Math.min(ua, now + skewMs) : now;
}

module.exports = { round2, clampUpdatedAt };

#!/usr/bin/env bash
# ============================================================================
# K-BOTANAS · corte-kbomx · Aplicar mejoras a ventas-view.jsx
# ============================================================================
# Cambios respecto a v1.11.1:
#   ✓ BUGFIX_LOST_EDITS — al guardar/eliminar una fila ya no se borran las
#     capturas en progreso de las DEMÁS filas (fix recargarCortes).
#   ✓ Filas TOTALES y GRAN TOTAL DEL DÍA ahora muestran formato completo
#     ($52,225.95) en vez de abreviado ($52.5k).
#   ✓ Quitado fontWeight: 700 inline de GRAN TOTAL DEL DÍA (mantiene colores).
#
# Garantías:
#   ✅ SOLO toca /var/www/corte.kbomx.com/ventas-view.jsx y su entry en index.html
#   ✅ NO toca otros proyectos (kbotanas-pwa, kbotanas-webhook)
#   ✅ NO toca pm2, ni BD, ni backend
#   ✅ Backup automático antes de cualquier cambio
#   ✅ Verifica que el archivo nuevo contiene las marcas esperadas antes de pisar
#   ✅ Idempotente
#
# USO (desde tu PC):
#   scp ventas-view.jsx apply-ventas-improvements.sh root@142.93.177.198:/tmp/
#   ssh root@142.93.177.198 "bash /tmp/apply-ventas-improvements.sh"
# ============================================================================

set -euo pipefail

readonly NGINX_ROOT="/var/www/corte.kbomx.com"
readonly TARGET="$NGINX_ROOT/ventas-view.jsx"
readonly INDEX="$NGINX_ROOT/index.html"
readonly SOURCE="/tmp/ventas-view.jsx"
readonly BACKUP_DIR="/opt/corte-kbomx/backups/ventas-update-$(date +%F-%H%M)"

# ─── Validaciones de seguridad ──────────────────────────────────────────────
[ -f "$SOURCE" ]      || { echo "❌ Falta /tmp/ventas-view.jsx (súbelo con scp)"; exit 1; }
[ -f "$TARGET" ]      || { echo "❌ No existe $TARGET"; exit 1; }
[ -f "$INDEX" ]       || { echo "❌ No existe $INDEX"; exit 1; }

# Validar que el archivo nuevo tenga lo que esperamos
if ! grep -q "VENTAS_VERSION = '1.11.2'" "$SOURCE"; then
  echo "❌ El archivo nuevo NO tiene VENTAS_VERSION = '1.11.2' — abort"; exit 1
fi
if ! grep -q "recargarCortes" "$SOURCE"; then
  echo "❌ El archivo nuevo NO tiene la función recargarCortes — abort"; exit 1
fi
if ! grep -q "BUGFIX_LOST_EDITS" "$SOURCE"; then
  echo "❌ El archivo nuevo NO tiene marcas BUGFIX_LOST_EDITS — abort"; exit 1
fi
# Verificar que NO queda ningún 'await cargar()' después de save/remove
if grep -q "await cargar();" "$SOURCE"; then
  # cargar() se sigue usando en useEffect inicial, eso es OK
  # pero NO debe haber 'await cargar()' (con paréntesis vacíos + ;) en
  # bloques que vengan después de api.cortes.save / api.cortes.remove
  AFTER_SAVE=$(awk '/api\.cortes\.(save|remove)/,/\}/' "$SOURCE" | grep -c "await cargar()" || true)
  if [ "$AFTER_SAVE" -gt 0 ]; then
    echo "❌ Aún hay 'await cargar()' después de save/remove — abort"; exit 1
  fi
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  K-BOTANAS · Actualizar ventas-view.jsx v1.11.2 · $(date '+%F %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── [1/4] Backup ───────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
cp "$TARGET" "$BACKUP_DIR/ventas-view.jsx"
cp "$INDEX"  "$BACKUP_DIR/index.html"
echo "[1/4] ✓ Backup en $BACKUP_DIR"
echo "      ventas-view.jsx → $(wc -c < "$BACKUP_DIR/ventas-view.jsx") bytes"
echo "      index.html      → $(wc -c < "$BACKUP_DIR/index.html") bytes"
echo ""

# ─── [2/4] Reemplazar ventas-view.jsx ───────────────────────────────────────
cp "$SOURCE" "$TARGET"
chown www-data:www-data "$TARGET"
chmod 644 "$TARGET"
echo "[2/4] ✓ Archivo reemplazado · $(wc -c < "$TARGET") bytes · $(wc -l < "$TARGET") líneas"
echo ""

# ─── [3/4] Actualizar versión cache en index.html ──────────────────────────
NEW_VER="$(date +%Y-%m-%d)v"
if grep -q 'ventas-view.jsx?v=' "$INDEX"; then
  sed -i "s|ventas-view.jsx?v=[a-zA-Z0-9-]*|ventas-view.jsx?v=$NEW_VER|g" "$INDEX"
  echo "[3/4] ✓ Cache-bust en index.html: ventas-view.jsx?v=$NEW_VER"
else
  echo "[3/4] ⚠️  No encontré '?v=' en ventas-view.jsx (cache-bust manual necesario)"
fi
chown www-data:www-data "$INDEX"
echo ""

# ─── [4/4] Verificación ─────────────────────────────────────────────────────
echo "[4/4] Verificación:"
echo "      ✓ VENTAS_VERSION en archivo:    $(grep -oE "VENTAS_VERSION = '[^']*'" "$TARGET" | head -1)"
echo "      ✓ Marcas BUGFIX_LOST_EDITS:      $(grep -c BUGFIX_LOST_EDITS "$TARGET")"
echo "      ✓ Función recargarCortes:        $(grep -c "const recargarCortes" "$TARGET")"
echo "      ✓ fmtMXN en fila TOTALES:        $(awk '/colSpan={3} className="first">TOTALES/,/<\/tr>/' "$TARGET" | grep -c fmtMXN)"
echo "      ✓ Nueva entrada cache:           $(grep -oE 'ventas-view.jsx\?v=[^"]*' "$INDEX" | head -1)"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ ACTUALIZACIÓN COMPLETA"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🌐 Abre corte.kbomx.com (Ctrl+Shift+R) → Ventas"
echo "   1) Captura cantidades en VARIAS rutas, da Enter en una sola"
echo "      → las cantidades de las DEMÁS filas deben mantenerse"
echo "   2) Las filas TOTALES y GRAN TOTAL DEL DÍA deben mostrar"
echo "      '\$52,225.95' en vez de '\$52.5k'"
echo ""
echo "🔄 ROLLBACK si algo sale mal:"
echo "   cp $BACKUP_DIR/ventas-view.jsx $TARGET"
echo "   cp $BACKUP_DIR/index.html      $INDEX"
echo "   chown www-data:www-data $TARGET $INDEX"
echo ""

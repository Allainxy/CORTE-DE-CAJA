#!/usr/bin/env bash
# ============================================================================
# K-BOTANAS · Sincronización frontend VPS
# ============================================================================
# Copia los archivos de frontend a /var/www/corte.kbomx.com/ (lo que nginx
# sirve) y a /opt/corte-kbomx/public/ (consistencia con deploy.sh), con backup
# previo y permisos www-data.
#
# USO (desde tu PC, en PowerShell):
#   scp $(echo movs-list.jsx index.html api.js) sync-frontend-files.sh root@142.93.177.198:/tmp/
#   ssh root@142.93.177.198 "bash /tmp/sync-frontend-files.sh"
# ============================================================================

set -e

# Archivos a desplegar (agrega aquí si en el futuro hay más)
FILES="movs-list.jsx index.html api.js daily-view.jsx app.jsx app-shell.jsx finrep-view.jsx"

TS=$(date +%F-%H%M)
BACKUP_DIR="/opt/corte-kbomx/backups/frontend-${TS}"
mkdir -p "$BACKUP_DIR"

NGINX_ROOT="/var/www/corte.kbomx.com"
PUBLIC_DIR="/opt/corte-kbomx/public"

echo "═══════════════════════════════════════════════════════════════"
echo "  Sincronización frontend · $TS"
echo "  Archivos: $FILES"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Validar que los archivos nuevos estén en /tmp
for f in $FILES; do
  if [ ! -f "/tmp/$f" ]; then
    echo "❌ Falta /tmp/$f. Súbelo con scp primero."
    exit 1
  fi
done

# Validar rutas destino
for d in "$NGINX_ROOT" "$PUBLIC_DIR"; do
  if [ ! -d "$d" ]; then
    echo "❌ No existe directorio destino: $d"
    exit 1
  fi
done

echo "[1/4] Backup de archivos actuales..."
for f in $FILES; do
  [ -f "$NGINX_ROOT/$f" ] && cp "$NGINX_ROOT/$f" "$BACKUP_DIR/${f}.nginx-root" && echo "    ✓ $NGINX_ROOT/$f → backup"
  [ -f "$PUBLIC_DIR/$f" ] && cp "$PUBLIC_DIR/$f" "$BACKUP_DIR/${f}.public" && echo "    ✓ $PUBLIC_DIR/$f → backup"
done
echo ""

echo "[2/4] Copiando a $NGINX_ROOT/ (lo que nginx sirve)..."
for f in $FILES; do
  cp "/tmp/$f" "$NGINX_ROOT/$f"
  chown www-data:www-data "$NGINX_ROOT/$f"
  chmod 644 "$NGINX_ROOT/$f"
  echo "    ✓ $f (www-data:www-data 644)"
done
echo ""

echo "[3/4] Copiando también a $PUBLIC_DIR/ (consistencia con deploy.sh)..."
for f in $FILES; do
  cp "/tmp/$f" "$PUBLIC_DIR/$f"
  echo "    ✓ $f"
done
echo ""

echo "[4/4] Verificación..."
echo "    NGINX_ROOT:"
echo "      api.js tiene listUsers: $(grep -c 'listUsers' "$NGINX_ROOT/api.js")"
echo "      movs-list.jsx tiene separadores por día: $(grep -c 'mt-daygroup' "$NGINX_ROOT/movs-list.jsx")"
echo "      index.html usa React producción: $(grep -c 'react.production.min.js' "$NGINX_ROOT/index.html")"
echo "      index.html NO carga xlsx eager (debe ser 0): $(grep -c 'xlsx.full.min.js\"' "$NGINX_ROOT/index.html")"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Sincronizado · $TS"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🌐 Abre corte.kbomx.com con Ctrl+Shift+R."
echo "   • Usuarios debe listar sin error."
echo "   • En Movimientos: orden por fecha/hora, separadores por día y marca ÚLTIMO."
echo ""
echo "🔄 ROLLBACK si algo sale mal:"
for f in $FILES; do
  echo "   cp $BACKUP_DIR/${f}.nginx-root $NGINX_ROOT/$f"
done
echo "   chown www-data:www-data $NGINX_ROOT/*.jsx $NGINX_ROOT/*.html $NGINX_ROOT/*.js"
echo ""

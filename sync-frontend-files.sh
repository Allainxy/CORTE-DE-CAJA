#!/usr/bin/env bash
# ============================================================================
# K-BOTANAS · Hotfix sincronización VPS
# ============================================================================
# Resuelve dos problemas detectados:
#   1. El archivo VIVO está en /var/www/corte.kbomx.com/ pero deploy.sh
#      sincroniza a /opt/corte-kbomx/public/. Por eso los cambios no se ven.
#   2. /var/www/corte.kbomx.com/movs-list.jsx era una versión más nueva
#      (con columna CAJA, filtros, permisos) que NO estaba en git.
#
# QUÉ HACE ESTE SCRIPT:
# - Copia movs-list.jsx (versión nueva con export Excel + proveedor + todo lo
#   que ya estaba vivo en prod) y index.html a /var/www/corte.kbomx.com/
# - También a /opt/corte-kbomx/public/ por consistencia
# - Hace backup de los archivos actuales antes de pisar
# - Corrige permisos para nginx (www-data)
#
# USO (desde tu PC, en PowerShell):
#   scp movs-list.jsx index.html sync-frontend-files.sh root@kbomx-erp-prod:/tmp/
#   ssh root@kbomx-erp-prod "bash /tmp/sync-frontend-files.sh"
# ============================================================================

set -e

TS=$(date +%F-%H%M)
BACKUP_DIR="/opt/corte-kbomx/backups/frontend-${TS}"
mkdir -p "$BACKUP_DIR"

NGINX_ROOT="/var/www/corte.kbomx.com"
PUBLIC_DIR="/opt/corte-kbomx/public"

echo "═══════════════════════════════════════════════════════════════"
echo "  Sincronización frontend · $TS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Validar que los archivos nuevos estén en /tmp
for f in movs-list.jsx index.html; do
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
for f in movs-list.jsx index.html; do
  if [ -f "$NGINX_ROOT/$f" ]; then
    cp "$NGINX_ROOT/$f" "$BACKUP_DIR/${f}.nginx-root"
    echo "    ✓ $NGINX_ROOT/$f → $BACKUP_DIR/${f}.nginx-root"
  fi
  if [ -f "$PUBLIC_DIR/$f" ]; then
    cp "$PUBLIC_DIR/$f" "$BACKUP_DIR/${f}.public"
    echo "    ✓ $PUBLIC_DIR/$f → $BACKUP_DIR/${f}.public"
  fi
done
echo ""

echo "[2/4] Copiando archivos nuevos a $NGINX_ROOT/ (lo que nginx sirve)..."
cp /tmp/movs-list.jsx "$NGINX_ROOT/movs-list.jsx"
cp /tmp/index.html "$NGINX_ROOT/index.html"
chown www-data:www-data "$NGINX_ROOT/movs-list.jsx" "$NGINX_ROOT/index.html"
chmod 644 "$NGINX_ROOT/movs-list.jsx" "$NGINX_ROOT/index.html"
echo "    ✓ Copiados con permisos www-data:www-data 644"
echo ""

echo "[3/4] Copiando también a $PUBLIC_DIR/ (consistencia con deploy.sh)..."
cp /tmp/movs-list.jsx "$PUBLIC_DIR/movs-list.jsx"
cp /tmp/index.html "$PUBLIC_DIR/index.html"
echo "    ✓ Copiados"
echo ""

echo "[4/4] Verificación..."
echo "    NGINX_ROOT:"
echo "      movs-list.jsx tiene 'EXPORTAR EXCEL': $(grep -c 'EXPORTAR EXCEL' "$NGINX_ROOT/movs-list.jsx")"
echo "      movs-list.jsx tiene columna CAJA: $(grep -c 'caja-cell' "$NGINX_ROOT/movs-list.jsx")"
echo "      index.html tiene sheetjs: $(grep -c 'sheetjs' "$NGINX_ROOT/index.html")"
echo ""
echo "    PUBLIC_DIR:"
echo "      movs-list.jsx tiene 'EXPORTAR EXCEL': $(grep -c 'EXPORTAR EXCEL' "$PUBLIC_DIR/movs-list.jsx")"
echo "      index.html tiene sheetjs: $(grep -c 'sheetjs' "$PUBLIC_DIR/index.html")"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Sincronizado · $TS"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🌐 Ahora abre corte.kbomx.com con Ctrl+Shift+R y busca el botón"
echo "   '📊 EXPORTAR EXCEL' arriba a la derecha en Movimientos."
echo ""
echo "🔄 ROLLBACK si algo sale mal:"
echo "   cp $BACKUP_DIR/movs-list.jsx.nginx-root $NGINX_ROOT/movs-list.jsx"
echo "   cp $BACKUP_DIR/index.html.nginx-root $NGINX_ROOT/index.html"
echo "   chown www-data:www-data $NGINX_ROOT/*.jsx $NGINX_ROOT/*.html"
echo ""

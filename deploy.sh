#!/usr/bin/env bash
# ============================================================================
# K-BOTANAS · corte-kbomx · deploy.sh
# ============================================================================
# Deploy automatizado para el VPS de producción.
# Hace: verificación → backup BD → git pull → sync frontend → pm2 reload → check
#
# USO (en el VPS, como root):
#   cd /opt/corte-kbomx
#   bash deploy.sh
#
# Aborta automáticamente si algo va mal (set -e). Imprime comando de rollback
# al final por si necesitas volver atrás.
#
# IMPORTANTE: este script SOLO toca corte-kbomx. No interfiere con kbotanas-pwa
# ni kbotanas-webhook que corren en el mismo pm2.
# ============================================================================

set -e

# ─── Configuración (no cambiar a menos que sepas qué haces) ──────────────────
REPO_DIR="/opt/corte-kbomx"
BACKEND_DIR="$REPO_DIR/backend"
DATA_DIR="$REPO_DIR/data"
BACKUP_DIR="$REPO_DIR/backups"
FRONTEND_DEST="/var/www/corte.kbomx.com"
PM2_NAME="corte-kbomx"
API_PORT="3401"
TS=$(date +%F-%H%M)

# ─── Localizar BD (puede estar en $DATA_DIR o en otro lado) ─────────────────
DB_FILE="$DATA_DIR/kbotanas.db"
if [ ! -f "$DB_FILE" ]; then
  DB_FILE=$(find "$REPO_DIR" -maxdepth 3 -name "kbotanas.db" 2>/dev/null | head -1)
fi

# ─── Sanity check ───────────────────────────────────────────────────────────
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "❌ $REPO_DIR no es un repo git. Aborto."
  exit 1
fi
if ! pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  echo "❌ pm2 no tiene proceso '$PM2_NAME'. Aborto."
  exit 1
fi

cd "$REPO_DIR"

echo "═══════════════════════════════════════════════════════════════"
echo "  K-BOTANAS · corte-kbomx · Deploy · $(date '+%F %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── [1/6] Working tree limpio (solo permitir backups/ untracked) ───────────
echo "[1/6] Verificando working tree..."
DIRTY=$(git status --porcelain | grep -vE "^\?\? (backups/|data/)" || true)
if [ -n "$DIRTY" ]; then
  echo "❌ Hay cambios sin commitear en el VPS:"
  echo "$DIRTY"
  echo ""
  echo "   El VPS no debería tener cambios locales. Investiga antes de continuar."
  echo "   Si son intencionales: git stash, ejecuta deploy, luego git stash pop."
  exit 1
fi
echo "    ✓ Limpio"
echo ""

# ─── [2/6] Backup obligatorio de BD ─────────────────────────────────────────
echo "[2/6] Backup de BD..."
mkdir -p "$BACKUP_DIR"
BACKUP_FILE=""
if [ -n "$DB_FILE" ] && [ -f "$DB_FILE" ]; then
  BACKUP_FILE="$BACKUP_DIR/kbotanas-PRE-DEPLOY-$TS.db"
  cp "$DB_FILE" "$BACKUP_FILE"
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "    ✓ $BACKUP_FILE ($SIZE)"
else
  echo "    ⚠️  BD no encontrada. Saltando backup. Investiga después."
fi
echo ""

# ─── [3/6] Git pull ─────────────────────────────────────────────────────────
echo "[3/6] Pull desde GitHub..."
BEFORE=$(git rev-parse --short HEAD)
git fetch origin main --quiet
AFTER_REMOTE=$(git rev-parse --short origin/main)

if [ "$BEFORE" = "$AFTER_REMOTE" ]; then
  echo "    ℹ️  Ya estaba al día ($BEFORE) — nada nuevo en GitHub"
  echo ""
  echo "    ¿Quieres forzar reload de pm2 + sync frontend igual? (s/N)"
  read -r FORCE
  if [[ ! "$FORCE" =~ ^[sSyY]$ ]]; then
    echo ""
    echo "    Cancelado. Sin cambios."
    exit 0
  fi
  AFTER="$BEFORE"
else
  git merge --ff-only origin/main
  AFTER=$(git rev-parse --short HEAD)
  echo "    ✓ Actualizado: $BEFORE → $AFTER"
  echo ""
  echo "    Commits incluidos:"
  git log --oneline "$BEFORE..$AFTER" | sed 's/^/      /'
fi
echo ""

# ─── [4/6] Sync frontend a nginx ────────────────────────────────────────────
echo "[4/6] Sincronizando frontend a $FRONTEND_DEST..."
if [ ! -d "$FRONTEND_DEST" ]; then
  echo "    ❌ $FRONTEND_DEST no existe. ¿nginx sirve desde otra ruta?"
  echo "       Edita FRONTEND_DEST en este script o créalo manualmente."
  exit 1
fi
rsync -a --delete \
  --exclude='backend/' \
  --exclude='system/' \
  --exclude='backups/' \
  --exclude='data/' \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='.env*' \
  --exclude='.gitignore' \
  --exclude='.dockerignore' \
  --exclude='deploy*.sh' \
  --exclude='Dockerfile' \
  --exclude='docker-compose.yml' \
  --exclude='ecosystem.config.js' \
  --exclude='nginx*.conf' \
  --exclude='init-letsencrypt.sh' \
  --exclude='*.md' \
  --exclude='LICENSE' \
  "$REPO_DIR/" "$FRONTEND_DEST/"

chown -R www-data:www-data "$FRONTEND_DEST"
find "$FRONTEND_DEST" -type f -exec chmod 644 {} \;
find "$FRONTEND_DEST" -type d -exec chmod 755 {} \;
COUNT=$(find "$FRONTEND_DEST" -maxdepth 1 -type f | wc -l)
echo "    ✓ $COUNT archivos en frontend"
echo ""

# ─── [5/6] Reload pm2 (corre cualquier migración pendiente al arrancar) ─────
echo "[5/6] Reload pm2 $PM2_NAME..."
pm2 reload "$PM2_NAME" --update-env >/dev/null
echo "    ✓ Reload enviado"
echo ""
echo "    Últimas líneas de log (busca '🔧 Migración' si agregaste schema nuevo):"
sleep 3
pm2 logs "$PM2_NAME" --lines 15 --nostream --raw 2>/dev/null | tail -15 | sed 's/^/      /'
echo ""

# ─── [6/6] Health check ─────────────────────────────────────────────────────
echo "[6/6] Health check API..."
sleep 2
API_RESP=$(curl -s -m 5 "http://localhost:$API_PORT/" 2>/dev/null || echo "TIMEOUT")
if echo "$API_RESP" | grep -q '"ok"\s*:\s*true'; then
  VERSION=$(echo "$API_RESP" | grep -oE '"version":"[^"]+"' | cut -d'"' -f4)
  echo "    ✓ API responde · versión $VERSION"
else
  echo "    ❌ API no responde correctamente:"
  echo "       $API_RESP"
  echo ""
  echo "    Revisa logs:  pm2 logs $PM2_NAME --lines 50"
  exit 1
fi
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Deploy completo · commit $AFTER"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "ROLLBACK (si algo se rompió en producción):"
echo "  cd $REPO_DIR && git reset --hard $BEFORE"
if [ -n "$BACKUP_FILE" ]; then
  echo "  cp $BACKUP_FILE $DB_FILE"
fi
echo "  pm2 reload $PM2_NAME"
echo ""

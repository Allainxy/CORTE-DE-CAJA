#!/bin/bash
# =============================================================
# K-BOTANAS · Backup automático diario
# Se ejecuta vía cron (configurar manualmente con crontab -e)
# Sugerido: 0 2 * * * /opt/corte-kbomx/system/auto-backup.sh >> /var/log/kbotanas-backup.log 2>&1
# =============================================================

DB_SOURCE=/opt/corte-kbomx/data/kbotanas.db
BACKUP_DIR=/opt/corte-kbomx/backups/auto
RETENTION_DAYS=30
TS=$(date +%Y-%m-%d-%H%M)
DEST="$BACKUP_DIR/kbotanas-AUTO-$TS.db"

# Asegurar directorio
mkdir -p "$BACKUP_DIR"

# Verificar que la BD existe
if [ ! -f "$DB_SOURCE" ]; then
  echo "[$(date)] ❌ BD origen no existe: $DB_SOURCE"
  exit 1
fi

# Backup con sqlite3 .backup (consistente incluso con la BD en uso)
if command -v sqlite3 &> /dev/null; then
  sqlite3 "$DB_SOURCE" ".backup '$DEST'"
  RESULT=$?
else
  # Fallback: copia simple
  cp "$DB_SOURCE" "$DEST"
  RESULT=$?
fi

if [ $RESULT -eq 0 ]; then
  SIZE=$(stat -c%s "$DEST" 2>/dev/null || stat -f%z "$DEST")
  echo "[$(date)] ✅ Backup OK: $DEST ($(numfmt --to=iec $SIZE 2>/dev/null || echo "$SIZE B"))"
else
  echo "[$(date)] ❌ Error al crear backup (código $RESULT)"
  exit 2
fi

# Limpiar backups viejos (> RETENTION_DAYS días)
DELETED=$(find "$BACKUP_DIR" -name "kbotanas-AUTO-*.db" -type f -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] 🧹 $DELETED backups viejos eliminados (> $RETENTION_DAYS días)"
fi

# Reportar estadísticas
TOTAL=$(ls -1 "$BACKUP_DIR"/kbotanas-AUTO-*.db 2>/dev/null | wc -l)
SIZE_TOTAL=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo "[$(date)] 📊 Total backups: $TOTAL · Espacio: $SIZE_TOTAL"

exit 0

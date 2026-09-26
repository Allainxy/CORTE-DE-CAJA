#!/usr/bin/env node
// ============================================================================
// scripts/restore-db.js — Restaurar la BD completa por SSH, con el servidor DETENIDO.
// Misma lógica que la restauración desde la app (lib/restore.js): valida el
// archivo, prueba de arranque en seco, conserva usuarios/bitácora actuales,
// respaldo de seguridad consistente, rename atómico y epoch nuevo (los
// dispositivos reconstruyen su copia local). Al arrancar, el servidor registra
// el resultado (o vuelve al respaldo de seguridad si el arranque falla).
//
// Uso:
//   pm2 stop corte-kbomx
//   node backend/scripts/restore-db.js --db /opt/corte-kbomx/data/kbotanas.db --from <respaldo.db> [--yes]
//   pm2 start corte-kbomx
// Opciones: --backups <dir> (def. <db>/../../backups)  --pm2-name <nombre> (def. corte-kbomx)
//   --allow-schema-diff  restaura aunque al respaldo le falten tablas/columnas/llaves de la BD
//                        actual (solo avisa). Para volver a un PRE-DEPLOY cuando la versión
//                        revertida ya agregó columnas: primero `git reset`, luego esto.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const R = require('../lib/restore');

function args() {
  const a = process.argv.slice(2);
  const out = { yes: false, allowSchemaDiff: false, pm2Name: 'corte-kbomx' };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') out.db = a[++i];
    else if (a[i] === '--from') out.from = a[++i];
    else if (a[i] === '--backups') out.backups = a[++i];
    else if (a[i] === '--pm2-name') out.pm2Name = a[++i];
    else if (a[i] === '--yes') out.yes = true;
    else if (a[i] === '--allow-schema-diff') out.allowSchemaDiff = true;
    else { console.error('Opción desconocida: ' + a[i]); process.exit(1); }
  }
  return out;
}

function fail(msg, code = 1) { console.error('✗ ' + msg); process.exit(code); }

function pm2Online(name) {
  const r = spawnSync('pm2', ['jlist'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0 || !r.stdout) return null; // pm2 no disponible
  try {
    const app = JSON.parse(r.stdout).find(p => p.name === name);
    return !!(app && app.pm2_env && app.pm2_env.status === 'online');
  } catch (_) { return null; }
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => {
    rl.question(q, (ans) => { rl.close(); res(ans.trim()); });
    rl.on('close', () => res('')); // EOF / Ctrl-D = cancelar
  });
}

const fmt = (s) => `movs=${s.movs ?? '-'} · último mov=${s.ultimo_mov ?? '-'} · cajas=${s.cajas ?? '-'} · usuarios=${s.usuarios ?? '-'}`;

(async () => {
  const o = args();
  if (!o.db || !o.from) fail('Uso: node backend/scripts/restore-db.js --db <kbotanas.db de producción> --from <respaldo.db> [--yes]');
  const dbFile = path.resolve(o.db);
  const from = path.resolve(o.from);
  if (!fs.existsSync(dbFile)) fail('No existe la BD ' + dbFile + ' (no hay rutas por defecto: pásala con --db).');
  if (!fs.existsSync(from)) fail('No existe el respaldo ' + from);
  if (from === dbFile) fail('--from y --db son el mismo archivo.');
  if (!o.yes && !process.stdin.isTTY) fail('Sin terminal interactiva: confirma con --yes.', 2);
  const backupsDir = path.resolve(o.backups || path.join(path.dirname(dbFile), '..', 'backups'));
  const autoDir = path.join(backupsDir, 'auto');
  fs.mkdirSync(autoDir, { recursive: true });

  const online = pm2Online(o.pm2Name);
  if (online === true) fail(`El servidor "${o.pm2Name}" está en línea. Detenlo primero: pm2 stop ${o.pm2Name}`);
  if (online === null) console.warn(`⚠ No se pudo consultar pm2; se confía en la verificación de uso exclusivo de la BD.`);

  const P = R.paths(dbFile);
  const mk = R.readMarker(P.markerPath);
  if (mk.exists) {
    const st = mk.marker && mk.marker.state;
    if (st === 'pending' || st === 'booting') {
      fail(`Hay una restauración sin terminar (${st}, ${P.markerPath}): arranca el servidor para que la resuelva. ` +
        'Si el servidor no puede arrancar, aparta ese archivo (mv) y vuelve a ejecutar esto.');
    }
    // Estado terminal o ilegible: ya no decide nada; se aparta para poder continuar
    const aparte = P.markerPath + '.done-' + Date.now();
    fs.renameSync(P.markerPath, aparte);
    console.warn(`⚠ Marker anterior (${st || 'ilegible'}) apartado en ${aparte}`);
  }

  const live = new Database(dbFile, { fileMustExist: true });
  let staged = null;
  try {
    console.log('• Validando y preparando ' + from + ' …');
    staged = await R.stageUpload({ sourceFile: from, stagingDir: P.stagingDir, liveDb: live, by: 'CLI (SSH)' });
    console.log('• Prueba de arranque en seco …');
    const { schema, keys } = await R.dryRunBoot({ stagedPath: staged.stagedPath, serverScript: path.join(__dirname, '..', 'server.js'), stagingDir: P.stagingDir, restoreId: staged.restoreId });
    const diff = R.compareSchema(schema, R.schemaOf(live), keys, R.keysOf(live));
    if (!diff.ok) {
      const det = 'tablas [' + diff.missingTables.join(', ') + '] columnas ' + JSON.stringify(diff.missingColumns) + ' llaves ' + JSON.stringify(diff.missingKeys);
      if (!o.allowSchemaDiff) throw new R.RestoreError('Al respaldo le faltan partes de la base actual: ' + det + '. (Si es un rollback de despliegue: --allow-schema-diff)', 422);
      console.warn('⚠ --allow-schema-diff: al respaldo le faltan ' + det);
    }
    console.log('\n  Respaldo : ' + fmt(staged.stats));
    console.log('  Actual   : ' + fmt(R.statsOf(live)));
    console.log('  Se conservan de la BD actual: ' + R.PRESERVED_TABLES.join(', ') + '\n');
    if (!o.yes) {
      const ans = await ask('Escribe RESTAURAR para reemplazar la base de datos: ');
      if (ans !== 'RESTAURAR') { R.removeWithSidecars(staged.stagedPath); live.close(); fail('Cancelado. No se tocó nada.', 2); }
    }

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const safetyPath = path.join(autoDir, `kbotanas-PRE-RESTORE-${ts}.db`);
    try {
      live.prepare(`INSERT INTO audit_log (ts, user_id, user_nombre, rol, accion, entidad, entidad_id, detalle, pin_validado)
        VALUES (?, NULL, 'CLI (SSH)', 'admin', 'RESTORE_FULL_INIT', 'backup', ?, ?, 0)`).run(
        Date.now(), staged.restoreId, JSON.stringify({ desde: path.basename(from), respaldo: staged.stats, safety: path.basename(safetyPath) }));
    } catch (e) { console.warn('⚠ No se pudo registrar en audit_log: ' + e.message); }
    await R.applyRestore({
      db: live, dbFile, stagedPath: staged.stagedPath, expectedEpoch: staged.epoch, safetyPath,
      markerPath: P.markerPath, restoreId: staged.restoreId, by: { id: null, nombre: 'CLI (SSH)', rol: 'admin' },
    });
    console.log('✓ Restaurada. Respaldo de seguridad: ' + safetyPath);
    console.log(`  Arranca el servidor: pm2 start ${o.pm2Name}  (al arrancar registra RESTORE_FULL_APPLIED o vuelve al respaldo si falla)`);
    process.exit(0);
  } catch (e) {
    if (staged && !e.renamed) R.removeWithSidecars(staged.stagedPath);
    try { if (live.open) live.close(); } catch (_) { /* ignore */ }
    const extra = e.dryRunOutput ? '\n' + e.dryRunOutput : '';
    fail((e instanceof R.RestoreError ? e.message : 'Error: ' + (e && e.stack || e)) + (e.renamed ? '' : ' La base de datos no cambió.') + extra);
  }
})();

// ============================================================================
// K-BOTANAS · ecosystem.config.js
// ============================================================================
// Configuración formal de pm2 para corte-kbomx.
//
// Este archivo es la FUENTE DE VERDAD sobre cómo debe iniciarse el backend.
// Si el VPS reinicia, pm2 lo levantará con esta configuración automáticamente
// (gracias a `pm2 startup` configurado por el instalador).
//
// USO:
//   pm2 start  ecosystem.config.js              # arrancar
//   pm2 reload ecosystem.config.js              # zero-downtime reload
//   pm2 stop   corte-kbomx                      # detener
//   pm2 logs   corte-kbomx                      # ver logs
//   pm2 monit                                   # dashboard interactivo
//
// IMPORTANTE: si modificas este archivo, recuerda:
//   pm2 reload ecosystem.config.js && pm2 save
// ============================================================================

// ─── Secreto JWT (NO se versiona) ───────────────────────────────────────────
// El secreto se lee de la variable de entorno JWT_SECRET o, en su defecto, del
// archivo data/.jwt_secret (carpeta data/ está en .gitignore). NUNCA hardcodear
// el secreto aquí: este archivo está versionado en GitHub.
// Para (re)generar el secreto en el servidor:
//   node -e "require('fs').writeFileSync(require('path').join(__dirname,'data','.jwt_secret'), require('crypto').randomBytes(32).toString('hex'))"
//   chmod 600 data/.jwt_secret && pm2 reload corte-kbomx --update-env && pm2 save
const fs = require('fs');
const path = require('path');
function readJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    return fs.readFileSync(path.join(__dirname, 'data', '.jwt_secret'), 'utf8').trim();
  } catch (e) {
    console.error('ecosystem.config.js: no se pudo leer data/.jwt_secret:', e.message);
    return undefined; // server.js abortará si JWT_SECRET queda vacío
  }
}

module.exports = {
  apps: [
    {
      name: 'corte-kbomx',
      script: '/opt/corte-kbomx/backend/server.js',
      cwd: '/opt/corte-kbomx/backend',

      // ─── Modo de ejecución ────────────────────────────────────────────────
      // 'fork' = un solo proceso (apropiado para SQLite, evita locks)
      // Si migras a Postgres en el futuro, podrías usar 'cluster' con varias
      // instancias para aprovechar multi-core.
      exec_mode: 'fork',
      instances: 1,

      // ─── Restart strategy ─────────────────────────────────────────────────
      autorestart: true,
      watch: false,                    // NO recargar al cambiar archivos (peligroso en prod)
      max_memory_restart: '500M',      // Reiniciar si pasa de 500MB (defensivo contra memory leaks)
      min_uptime: '10s',               // Considerar arranque exitoso solo si dura >10s
      max_restarts: 10,                // Si crashea 10 veces seguidas en <1 min, pm2 lo detiene
                                       // (evita loops infinitos de crash-restart)

      // ─── Variables de entorno ─────────────────────────────────────────────
      env: {
        NODE_ENV: 'production',
        PORT: 3401,                            // Coincide con proxy_pass de nginx
        DB_FILE: '/opt/corte-kbomx/data/kbotanas.db',
        JWT_SECRET: readJwtSecret(),           // ← desde env o data/.jwt_secret (ver arriba); NUNCA hardcodear
        TZ: 'America/Mexico_City',             // Zona horaria para timestamps consistentes
      },

      // ─── Logs ─────────────────────────────────────────────────────────────
      // PM2 guarda logs en ~/.pm2/logs/ por default. Configuramos rotación
      // mediante el módulo pm2-logrotate (lo instala el installer).
      out_file: '/root/.pm2/logs/corte-kbomx-out.log',
      error_file: '/root/.pm2/logs/corte-kbomx-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // ─── Graceful shutdown ────────────────────────────────────────────────
      kill_timeout: 5000,              // Dar 5 segundos para terminar requests en vuelo
      wait_ready: false,               // No esperamos process.send('ready')
      listen_timeout: 10000,           // Si no levanta en 10s, considerarlo fallo
    },
  ],
};

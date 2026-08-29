# 📋 Auditoría a fondo — CORTE-DE-CAJA (K-BOTANAS)

> Fecha: 2026-06-18 · Solo diagnóstico (no se modificó código durante la auditoría).
> Alcance: diseño/código, infraestructura, flujo de información, modelo de datos, UX.

## Resumen ejecutivo

El sistema **funciona y está bien mantenido para su escala** (4 usuarios, BD de 1.5 MB / 1 665 movimientos / 35 tablas). Las decisiones de infraestructura clave son correctas (WAL, pm2 fork/1, JWT desde archivo, PIN con lockout, ufw+fail2ban+certbot). La deuda **no es de seguridad grave ni de rendimiento actual**, sino de **3 ejes**:

1. **Correctitud financiera** — dinero en punto flotante e IDs con riesgo de colisión silenciosa.
2. **Veracidad del "offline-first"** — la sincronización solo cubre 5 de 35 tablas; la mayoría de los módulos son online-only.
3. **Mantenibilidad** — monolitos (server.js 5 850 líneas, vistas de 2 700), sin tests, duplicación de código (`_vps_frontend/`, helpers de formato), Babel en el navegador.

Prioridad transversal más alta: **dinero como `REAL`** y **IDs `Date.now()+random`**, porque pueden corromper datos en silencio.

---

## 1. 🖥️ Infraestructura y operación

| Aspecto | Estado | Nota |
|---|---|---|
| Recursos VPS | ✅ Holgado | Disco 16% (131 GB libres), RAM 3.2/7.8 GB, swap casi sin uso, load ~0.1 |
| Aislamiento de servicios | ✅ Correcto | Postgres/Redis/MinIO/Adminer **solo en 127.0.0.1** (no públicos) |
| Firewall / hardening | ✅ Bueno | ufw activo, SSH rate-limited (LIMIT), fail2ban activo, certbot auto-renueva |
| pm2 arranque | ✅ | systemd `pm2-root.service` configurado |
| **Backups de CORTE** | 🔴 **Riesgo** | **No hay cron diario.** Solo respaldos *pre-deploy* (147 acumulados, sin rotación). Si no hay deploy en semanas, no hay respaldo nuevo. |
| **Single point of failure** | 🟠 Alto | Un solo VPS aloja ~13 contenedores + 3 procesos pm2 (corte, tienda, webhook, ERP, mayoreo, ruteo OSRM/VROOM). Si cae el VPS, todos los negocios caen. |
| Headers de seguridad HTTP | 🟠 Medio | Faltan HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| CI/CD | 🟠 Medio | Deploy 100% manual |
| Monitoreo/alertas | 🟠 Medio | Sin uptime monitoring ni alertas |

---

## 2. 🔄 Modelo de datos y flujo de información

**Esquema en vivo:** 35 tablas, 54 índices. Cobertura de índices buena en tablas nuevas (ventas, cortes, nómina, cxp, órdenes).

### Flujo de sincronización
```
Captura (id='m'+Date.now()+rand) → IndexedDB → cola localStorage (kbot_queue, FIFO)
   → flushQueue [online] → POST /api/movs (UPSERT ON CONFLICT)
   → GET /api/sync?since=serverTime (WHERE updated_at > since)
   → processSyncResult: bulkPut(vivos) + del(borrados) → setState
```

| # | Hallazgo | Sev. | Evidencia |
|---|---|---|---|
| D1 | **Dinero en `REAL` (float)** en toda la BD. Ya hay `Math.round(x*100)/100` defensivo = el drift es real. | 🔴 ALTO | `init-db.js:33` |
| D2 | **IDs generados en cliente con colisión** `'m'+Date.now()+rand(0-999)`. UPSERT pisa sin error. | 🔴 ALTO | `capture.jsx:101` + `server.js:628` |
| D3 | **Sin last-write-wins real**: UPSERT pisa con `updated_at` del servidor sin comparar el entrante. | 🔴 ALTO | `server.js:631` |
| D4 | **Sync solo cubre 5 tablas**; cxp, ventas, arqueos, órdenes, nómina, viáticos son online-only. | 🟠 MEDIO | `server.js:1686` |
| D5 | **FK declaradas pero no aplicadas** (sin `PRAGMA foreign_keys=ON`); resto por convención → huérfanos. | 🟠 MEDIO | esquema |
| D6 | **Saldo con doble fuente de verdad** (cliente x3 + servidor); `POST /api/movs` no valida saldo. | 🟠 MEDIO | `server.js:835/950` |
| D7 | **Contrato roto `alreadyGone`**: 404 lanza en `req()` → mov "fantasma" en cliente. | 🟠 MEDIO | `api.js:20`, `app.jsx:215` |
| D8 | Borrado offline no se propaga (borrado con PIN es online directo). | 🟡 BAJO | `api.js:124` |
| D9 | `audit_log` solo registra borrados, no creaciones/ediciones de montos. Sin retención. | 🟡 BAJO | `server.js:576` |

---

## 3. ⚙️ Arquitectura backend / código

| # | Hallazgo | Sev. |
|---|---|---|
| B1 | **Sin error handler global**; bloque de migraciones (19-450) sin proteger → query que lance ahí mata el proceso (crash-loop). | 🔴 ALTO |
| B2 | **Monolito sin capas**: routing+validación+negocio+datos inline en ~125 handlers. | 🔴 ALTO |
| B3 | **Testabilidad nula**: 0 tests; lógica no extraíble. | 🔴 ALTO |
| B4 | **Orden de rutas frágil** (`HOTFIX_ROUTE_ORDER` para ventas-cierres-dia). | 🟠 MEDIO |
| B5 | **Validación copiada** en cada handler (sin joi/zod); respuestas inconsistentes. | 🟠 MEDIO |
| B6 | **Migraciones por idempotencia, sin versión ni rollback**; acoplamiento oculto entre módulos. | 🟠 MEDIO |
| B7 | **Exports en memoria** (xlsx/pdfkit) con `max_memory_restart:500M`. | 🟠 MEDIO |
| B8 | Logging sin niveles/request-id/rotación; rutas absolutas hardcodeadas; código muerto. | 🟡 BAJO |

**Positivo:** transacciones bien usadas (30), queries parametrizadas, WAL + fork/1 correcto para SQLite.

---

## 4. 🎨 Arquitectura frontend / UX / diseño

| # | Hallazgo | Sev. |
|---|---|---|
| F1 | **`_vps_frontend/` = copia completa de los 22 `.jsx`** → doble mantenimiento, divergencia activa. | 🔴 ALTO |
| F2 | **Babel transpila ~18k líneas de JSX en el navegador en cada arranque**. | 🔴 ALTO |
| F3 | **Accesibilidad débil**: `outline:none` sin `:focus-visible`, casi sin `<label>`/`aria`, áreas táctiles <44px, contraste dudoso. | 🔴 ALTO |
| F4 | **Helpers de formato duplicados** en 6 vistas, con redondeo divergente. | 🟠 MEDIO |
| F5 | **Monolitos de UI** (compras 2 704, nómina 2 190, ventas 1 924); ~24 modales sin base común; fetching duplicado. | 🟠 MEDIO |
| F6 | **Tablas tipo Excel sin tratamiento móvil**. | 🟠 MEDIO |
| F7 | Routing por `useState('active')` (sin URL/Atrás); estado por props drilling + globales `window.*`. | 🟠 MEDIO |
| F8 | Manifest con un solo `logo.png` para 192/512 (sin maskable). | 🟡 BAJO |

**Positivo:** sistema de diseño por tokens CSS (tema claro/oscuro + 5 acentos), SW bien diseñado, feedback de sync y banner de update, CDN con SRI/integrity.

---

## 5. 🗺️ Roadmap de mejora (con estado)

> Estado: ⬜ pendiente · 🔄 en progreso · ✅ hecho

> Progreso 2026-06-18 (rama `fix/roadmap-fase1`): aplicados #2, #4, #5, #8(headers), y fix 404. Diseños listos para #1, #3, #6, F4 (ver `docs/DISENOS-PENDIENTES.md`).
> Progreso 2026-08-05: DESPLEGADO a producción #2 (IDs), #5 (error handler+migraciones), fix 404 (main @ 0d633d3). #1 resuelto con enfoque B (redondeo consistente en saldos, main @ e97a5eb) — la migración completa a enteros-centavos (A) queda diferida (requiere tests #7 primero). #3 resolución de conflictos LWW desplegada (main @ 9627311): cliente envía updated_at lógico + offset de reloj, server aplica UPSERT condicional. Estado: #1✅(B) #2✅ #3✅ #4✅ #5✅ #8-headers✅ · pendientes: #6(routers,diseñado), #7(tests), #8-monitoreo, #9-15.

**Fase 1 — Correctitud de datos (lo más importante):**
1. 🔄 Migrar dinero a **enteros-centavos**. *(diseño listo — alto riesgo, pendiente sign-off + ventana)*
2. ✅ IDs cliente+server a **`crypto.randomUUID()`** (helper `newId`, anti-colisión). *Nota: se preservaron a propósito 2 ids con dependencia de formato (id de movimiento `'m'+timestamp` y folio de orden `'ord-'`); el id de movimiento offline conviene resolverlo seteando `created_at` en cliente (follow-up).*
3. 🔄 UPSERT con guard real de conflicto (cliente envía `updated_at` lógico + LWW). *(diseño listo)*
4. ✅ Backup diario de `corte` (cron 2am, `.backup` consistente, rotación 30d). *Pendiente: copia fuera del VPS.*

**Fase 2 — Robustez backend:**
5. ✅ Error handler global + bloque de migraciones protegido (try/catch + `process.exit(1)`).
6. 🔄 Extraer routers/servicios del monolito; arreglar el orden de rutas. *(diseño/secuencia incremental lista)*
7. 🔄 Tests: suite base con `node --test` desplegada (main @ ba77f19) — `backend/lib/money.js` (round2/clampUpdatedAt) extraído y testeado; tests de contrato de la guarda LWW y del saldo (afecta_saldo, fecha_inicial, redondeo). 14/14 verde. Falta ampliar cobertura conforme se extraiga más lógica (#6).
8. 🔄 Headers de seguridad ✅ (HSTS/X-Frame/X-Content/Referrer/Permissions) · monitoreo externo ⬜.

**Fase 3 — Frontend/UX:**
9. 🔄 Centralizar helpers de formato (análisis listo: identicos vs divergentes) · eliminar `_vps_frontend/` ⬜.
10. ⬜ Build con esbuild/Vite (mata Babel-en-navegador y el `?v=` manual).
11. ⬜ Pase de accesibilidad + responsive de tablas grandes.
12. ⬜ `<Modal>`/`<DataTable>` base + hook `useApi`; descomponer monolitos.

**Fase 4 — Decisiones de fondo:**
13. ⬜ Evaluar Postgres + pm2 cluster si crece el uso.
14. ⬜ Completar el "offline-first" (sync de tablas faltantes) o rebautizar honestamente.
15. ⬜ Separar el ERP a otro servidor (mitigar SPOF) y automatizar deploy (GitHub Action).

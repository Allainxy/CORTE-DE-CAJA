# 🌶️ K-BOTANAS · Control de Caja

PWA empresarial para llevar el control de gastos e ingresos en efectivo de **K-BOTANAS**. Funciona offline en móvil y escritorio, con sincronización opcional entre 4 usuarios mediante backend Node.js.

![K-BOTANAS](logo.png)

## ✨ Características

- 📱 **PWA instalable** — funciona offline en móvil, tablet y escritorio
- 💰 **Captura rápida o detallada** de ingresos y gastos en efectivo
- 📊 **Dashboard** con resumen del día, semana, mes y año
- 📈 **Reportes** con gráficas de línea, barras y heatmap calendario
- 📂 **Importar / Exportar XML** (drag & drop)
- 📥 **Exportar a Excel/CSV y PDF**
- 🏷️ **Categorías personalizables** con presupuestos mensuales
- 🔍 **Búsqueda avanzada** y filtros por fecha, tipo, categoría
- 🌗 **Tema claro/oscuro** y 5 colores de acento (botanero, naranja, amarillo, magenta, verde)
- 👥 **Multi-usuario** (4 cuentas) con login y JWT
- 🔄 **Sincronización offline-first** (cola de cambios)

## 📁 Estructura del proyecto

```
k-botanas/
├── index.html              ← PWA (frontend)
├── styles.css
├── *.jsx / *.js            ← Componentes React + helpers
├── manifest.json           ← Manifest PWA
├── sw.js                   ← Service worker offline
├── logo.png
└── backend/                ← API Node.js (opcional)
    ├── server.js
    ├── init-db.js
    ├── change-password.js
    ├── package.json
    └── README.md
```

## 🚀 Uso rápido

### Solo PWA (sin backend, 100% local)

Abre `index.html` en cualquier navegador moderno o súbelo a:
- **GitHub Pages** (gratis)
- **Netlify / Vercel** (gratis)
- Cualquier hosting estático

Todos los datos quedan guardados en el navegador (IndexedDB).

### Con backend (multi-usuario, sincronizado)

1. Sube la carpeta `backend/` a un hosting Node (Render, Railway, VPS, NAS):
   ```bash
   cd backend
   npm install
   npm run init     # Crea la BD con 4 usuarios
   npm start        # Puerto 3001
   ```
2. En `index.html` configura la URL del backend:
   ```html
   <meta name="api-url" content="https://api.tudominio.com" />
   ```
3. Sube `index.html` y los demás assets a un hosting estático.
4. Cambia las contraseñas:
   ```bash
   node backend/change-password.js admin TuNuevaContraseña
   ```

Ver instrucciones completas en [`backend/README.md`](backend/README.md).

## 🌐 Subir a GitHub

```bash
git init
git add .
git commit -m "Primera versión K-BOTANAS"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/k-botanas.git
git push -u origin main
```

### Publicar la PWA con GitHub Pages

1. En el repo: **Settings → Pages**
2. Source: **Deploy from a branch** → `main` / `/ (root)`
3. Tu PWA quedará disponible en `https://TU-USUARIO.github.io/k-botanas/`

## 👥 Usuarios por defecto

| Usuario | Contraseña | Rol     |
|---------|------------|---------|
| admin   | kbot2026   | admin   |
| caja1   | kbot2026   | usuario |
| caja2   | kbot2026   | usuario |
| ruta1   | kbot2026   | usuario |

> ⚠️ **Cambia las contraseñas** después del primer login.

## 🛠️ Tecnologías

- **Frontend**: React 18 + Babel standalone (sin build) + IndexedDB
- **Backend**: Node.js + Express + better-sqlite3
- **Auth**: bcrypt + JWT
- **PWA**: Service Worker + Manifest + offline-first

## 📄 Licencia

MIT — Uso libre, atribuye si quieres 🙏

## 🌶️ Sobre K-BOTANAS

> "Somos la mejor botana"

---

Hecho con ❤️ para K-BOTANAS

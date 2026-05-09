# 🚀 Guía paso a paso: Subir K-BOTANAS a GitHub

## 1. Crear el repositorio en GitHub

1. Entra a https://github.com/new
2. Nombre del repo: `k-botanas` (o el que prefieras)
3. Descripción: `Control de Caja PWA para K-BOTANAS`
4. Público o privado (tu eliges)
5. **NO** marques "Add README", "Add .gitignore" ni "Add license" (ya los tienes)
6. Click en **Create repository**

## 2. Subir desde tu computadora

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
git init
git add .
git commit -m "🌶️ K-BOTANAS Control de Caja v1.0"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/k-botanas.git
git push -u origin main
```

> Reemplaza `TU-USUARIO` con tu nombre de usuario de GitHub.

## 3. Activar GitHub Pages (PWA gratis online)

1. En el repo en GitHub, ve a **Settings → Pages**
2. En **Source** elige: **GitHub Actions**
3. Cada `git push` desplegará automáticamente la PWA
4. Tu PWA estará en: `https://TU-USUARIO.github.io/k-botanas/`

> ⚠️ GitHub Pages **solo sirve la PWA**. El backend Node hay que ponerlo en otro lado (Render, Railway, VPS, NAS).

## 4. Desplegar el backend (3 opciones gratuitas/baratas)

### Opción A — Render (gratis, fácil)

1. Crea cuenta en https://render.com
2. **New → Web Service**
3. Conecta tu repo de GitHub
4. Configuración:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run init`
   - **Start Command**: `npm start`
   - **Environment**: agrega `JWT_SECRET` con un texto largo aleatorio
5. Render te da una URL tipo `https://k-botanas-api.onrender.com`

### Opción B — Railway

1. https://railway.app
2. **New Project → Deploy from GitHub**
3. Root Directory: `backend`
4. Variables: `JWT_SECRET=...`

### Opción C — VPS / NAS propio

```bash
git clone https://github.com/TU-USUARIO/k-botanas.git
cd k-botanas/backend
npm install
npm run init
JWT_SECRET="tu-secreto" pm2 start server.js --name kbotanas
```

Configura un dominio o usa la IP + puerto.

## 5. Conectar la PWA al backend

Edita `index.html` línea ~10:

```html
<meta name="api-url" content="https://k-botanas-api.onrender.com" />
```

Haz commit y push — la PWA en GitHub Pages se actualiza sola.

## 6. Cambiar contraseñas

```bash
# En el servidor donde corre el backend:
node change-password.js admin TuContraseñaSegura
node change-password.js caja1 OtraContraseña
node change-password.js caja2 OtraContraseña
node change-password.js ruta1 OtraContraseña
```

## 7. Respaldos

El archivo `backend/kbotanas.db` contiene **todos los datos**. Configura un cron para respaldarlo:

```bash
# Linux/Mac, cada día a las 23:00
0 23 * * * cp /ruta/backend/kbotanas.db /ruta/backups/kbotanas-$(date +\%F).db
```

## ⚠️ Importante

- **NUNCA subas** `backend/kbotanas.db` ni `.env` a GitHub (ya están en `.gitignore`)
- Cambia el `JWT_SECRET` antes de producción
- Activa HTTPS (automático en Render/Railway, manual en VPS con Let's Encrypt)

## 🆘 Problemas comunes

**La PWA no carga el login**
→ Verifica que `<meta name="api-url">` tenga la URL correcta y que el backend esté corriendo.

**Error CORS**
→ El backend ya tiene CORS abierto. Si lo cambiaste, restáuralo.

**No me deja instalar la PWA**
→ Asegúrate de servirla por HTTPS (GitHub Pages ya lo hace).

**Olvidé la contraseña de un usuario**
→ Usa `node change-password.js usuario nueva-contraseña` en el servidor.

---

¿Dudas? Abre un issue en el repo 🌶️

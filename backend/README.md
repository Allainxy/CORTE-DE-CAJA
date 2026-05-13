# K-BOTANAS · Backend API

Backend en Node.js + Express + SQLite para sincronizar la PWA entre 4 usuarios.

## 📋 Requisitos

- Node.js 18 o superior
- Cualquier hosting con soporte Node (Render, Railway, VPS, NAS, etc.)

## 🚀 Instalación

```bash
cd backend
npm install
npm run init    # Crea la BD e inserta los 4 usuarios
npm start       # Inicia el servidor en el puerto 3001
```

El archivo `kbotanas.db` se genera automáticamente. Es la base de datos completa: respáldalo periódicamente.

## 🔑 Usuarios por defecto

| Usuario       | Contraseña | Rol      |
|---------------|------------|----------|
| `admin`       | `kbot2026` | admin    |
| `caja1`       | `kbot2026` | usuario  |
| `caja2`       | `kbot2026` | usuario  |
| `ruta1`       | `kbot2026` | usuario  |

> ⚠️ **Cambia las contraseñas** después del primer login. Edita `init-db.js` con los nombres reales y vuelve a ejecutar `npm run init` (esto borra la BD; haz respaldo primero).

## ⚙️ Configuración

Variables de entorno (opcional, todas tienen default):

```bash
PORT=3001
JWT_SECRET=cambia-esto-por-algo-largo-y-aleatorio
DB_FILE=./kbotanas.db
```

En tu hosting crea un archivo `.env` o configúralo desde el panel.

## 🌐 Conectar la PWA al backend

Abre `index.html` y al final del `<head>` se incluye:

```html
<meta name="api-url" content="http://localhost:3001" />
```

Cámbialo por la URL pública de tu backend, por ejemplo:

```html
<meta name="api-url" content="https://api.tudominio.com" />
```

La PWA detectará el backend y mostrará pantalla de login. Si no hay backend o no hay internet, sigue funcionando con almacenamiento local (offline-first) y sincroniza cuando vuelva a haber red.

## 📡 Endpoints

| Método | Ruta                  | Auth | Descripción                     |
|--------|-----------------------|------|---------------------------------|
| POST   | `/api/login`          | ❌   | Devuelve token JWT              |
| GET    | `/api/me`             | ✅   | Datos del usuario               |
| GET    | `/api/movs`           | ✅   | Lista todos los movimientos     |
| POST   | `/api/movs`           | ✅   | Crea o actualiza un movimiento  |
| DELETE | `/api/movs/:id`       | ✅   | Elimina movimiento              |
| POST   | `/api/movs/bulk`      | ✅   | Importa lote (XML)              |
| GET    | `/api/cats`           | ✅   | Lista de categorías             |
| POST   | `/api/cats`           | ✅   | Crea/actualiza categoría        |
| DELETE | `/api/cats/:id`       | ✅   | Elimina categoría               |
| GET    | `/api/budgets`        | ✅   | Lista presupuestos              |
| POST   | `/api/budgets`        | ✅   | Crea/actualiza presupuesto      |
| GET    | `/api/sync?since=ts`  | ✅   | Cambios desde timestamp         |

## 💾 Respaldos

El archivo `kbotanas.db` contiene TODA la información. Respáldalo:

```bash
# Linux/Mac
cp kbotanas.db backups/kbotanas-$(date +%F).db

# O usa el endpoint:
curl -H "Authorization: Bearer TU_TOKEN" \
  http://tu-servidor/api/movs > respaldo.json
```

## 🔒 Cambiar contraseñas

```bash
node change-password.js usuario nuevaContraseña
```

## 🐛 Logs

Por defecto se imprimen en consola. En producción usa `pm2` o redirige a archivo:

```bash
pm2 start server.js --name kbotanas
pm2 logs kbotanas
```

# 🚀 Guía maestra: GitHub → DigitalOcean → corte.kbomx.com

Esta guía te lleva del proyecto en tu computadora a tener `https://corte.kbomx.com` funcionando con login, SSL y todo. **Tiempo estimado: 30–45 min** la primera vez.

---

## 📋 Resumen de la arquitectura

```
                        Internet (HTTPS)
                              │
                    https://corte.kbomx.com
                              │
                    ┌─────────▼──────────┐
                    │   nginx (Droplet)  │
                    │   Let's Encrypt    │
                    └────┬───────────┬───┘
                         │           │
                  /  (PWA)         /api/  (proxy)
                         │           │
                  ┌──────▼───┐   ┌───▼─────────┐
                  │ archivos │   │ Node.js     │
                  │ estáticos│   │ Express +   │
                  │ (PWA)    │   │ SQLite      │
                  └──────────┘   └─────────────┘
                                      │
                                  /data/kbotanas.db
                                  (volumen persistente)
```

**Todo en un solo Droplet de DigitalOcean** — sin CORS, un solo certificado SSL, un solo costo (~6 USD/mes).

---

## PARTE 1 · Subir el proyecto a GitHub

### 1.1 Crear el repositorio

1. Entra a https://github.com/new
2. **Repository name**: `k-botanas` (o como prefieras — todos los comandos asumen este nombre)
3. **Description**: `Control de Caja PWA para K-BOTANAS`
4. Visibilidad: **Private** recomendado (datos de negocio)
5. **NO** marques "Add README", "Add .gitignore" ni "Add license" (ya los tienes)
6. **Create repository**

### 1.2 Subir el código desde tu computadora

Abre una terminal en la carpeta del proyecto (donde está `index.html`):

```bash
git init
git add .
git commit -m "K-BOTANAS Control de Caja v1.0"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/k-botanas.git
git push -u origin main
```

> Reemplaza `TU-USUARIO` con tu usuario de GitHub. La primera vez te pedirá login — usa un **Personal Access Token** (Settings → Developer settings → Personal access tokens), no tu contraseña normal.

✅ **Verificación**: entra a `https://github.com/TU-USUARIO/k-botanas` y deberías ver todos los archivos.

---

## PARTE 2 · Crear el Droplet en DigitalOcean

### 2.1 Crear el Droplet

1. Entra a https://cloud.digitalocean.com/droplets/new
2. Configuración:
   - **Imagen**: Ubuntu 24.04 LTS x64
   - **Plan**: Basic → Regular SSD → **6 USD/mes** (1 GB RAM, 1 vCPU, 25 GB SSD) — sobra para K-BOTANAS
   - **Datacenter**: NYC3 o SFO3 (más cerca de México)
   - **Authentication**: SSH Key (recomendado) o Password
   - **Hostname**: `kbotanas-prod`
3. **Create Droplet**
4. Anota la **IP pública** que te asigna (ej. `159.203.45.67`)

### 2.2 Configurar el DNS de kbomx.com

En el panel donde administras el dominio `kbomx.com` (Cloudflare, Namecheap, GoDaddy, donde lo tengas):

| Tipo | Nombre  | Valor             | TTL  |
|------|---------|-------------------|------|
| A    | `corte` | IP-DEL-DROPLET    | 300  |

Verifica con:
```bash
dig +short corte.kbomx.com
# debe responder con la IP del Droplet
```

> ⏱️ Puede tardar 5–30 min en propagar. **No avances hasta que `dig` te responda con la IP correcta** — Let's Encrypt fallará si el DNS no apunta bien.

### 2.3 Conectarte al Droplet por SSH

```bash
ssh root@IP-DEL-DROPLET
```

---

## PARTE 3 · Preparar el Droplet

Todo esto se hace **dentro del Droplet** (sesión SSH).

### 3.1 Actualizar e instalar Docker

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin git rsync ufw
systemctl enable --now docker

# Firewall: solo SSH, HTTP, HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

### 3.2 Clonar tu repo

```bash
cd /opt
git clone https://github.com/TU-USUARIO/k-botanas.git
cd k-botanas
```

> Si tu repo es **privado**, GitHub te pedirá usuario + Personal Access Token. Alternativamente configura una deploy key (Settings del repo → Deploy keys → Add deploy key con la clave pública del Droplet `~/.ssh/id_ed25519.pub`).

### 3.3 Crear el archivo .env

```bash
cp .env.example .env
nano .env
```

Pon dos valores reales:

```
JWT_SECRET=<<<aquí pega lo que devuelve `openssl rand -hex 48`>>>
EMAIL=tu-correo-real@kbomx.com
```

Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

> ⚠️ Genera el `JWT_SECRET` con `openssl rand -hex 48` directamente en el Droplet y pégalo. Si todos los users están logueados con el mismo secreto, cambiarlo invalida todas las sesiones.

### 3.4 Preparar la carpeta `public` (frontend estático que servirá nginx)

```bash
chmod +x deploy.sh init-letsencrypt.sh
mkdir -p public
rsync -av --exclude='backend/' --exclude='Dockerfile' \
  --exclude='docker-compose.yml' --exclude='nginx*.conf' \
  --exclude='init-letsencrypt.sh' --exclude='deploy.sh' \
  --exclude='public/' --exclude='certbot/' --exclude='.git/' \
  --exclude='.github/' --exclude='.env*' --exclude='*.md' \
  --exclude='LICENSE' --exclude='.dockerignore' --exclude='.gitignore' \
  --exclude='.do/' \
  ./ ./public/
```

---

## PARTE 4 · Levantar el stack y emitir SSL

### 4.1 Build inicial

```bash
docker compose build
```

### 4.2 Emitir el certificado SSL la primera vez

```bash
./init-letsencrypt.sh
```

Este script hace la danza necesaria con Let's Encrypt (cert temporal → arrancar nginx → pedir cert real → recargar). Tarda ~1 min.

✅ Si ves `✅ Listo. Visita https://corte.kbomx.com`, **funcionó**.

### 4.3 Levantar todo el stack

```bash
docker compose up -d
docker compose ps    # los 3 servicios deben estar "running"
docker compose logs -f --tail=50    # Ctrl+C para salir
```

🎉 **Abre `https://corte.kbomx.com` en tu navegador**. Deberías ver el login de K-BOTANAS.

---

## PARTE 5 · Cambiar las contraseñas por defecto

Las credenciales de fábrica son `kbot2026` para los 4 usuarios. **Cámbialas YA**:

```bash
docker compose exec backend node change-password.js admin TuPasswordSeguraDelAdmin
docker compose exec backend node change-password.js caja1  PasswordCaja1
docker compose exec backend node change-password.js caja2  PasswordCaja2
docker compose exec backend node change-password.js ruta1  PasswordRuta1
```

---

## PARTE 6 · Flujo de actualización (cuando hagas cambios)

Cada vez que toques código en tu compu y quieras desplegar:

**En tu compu:**
```bash
git add .
git commit -m "describe el cambio"
git push
```

**En el Droplet (SSH):**
```bash
cd /opt/k-botanas
./deploy.sh
```

El script hace `git pull`, sincroniza el frontend a `public/`, rebuilda el backend y recarga nginx. ~30 segundos.

> Si quieres automatizar esto con un webhook de GitHub o un GitHub Action que haga SSH al Droplet, dime y te lo armo.

---

## 🔧 Comandos útiles del Droplet

```bash
# Ver logs en vivo
docker compose logs -f backend
docker compose logs -f nginx

# Reiniciar solo el backend
docker compose restart backend

# Apagar todo
docker compose down

# Levantar todo
docker compose up -d

# Ver uso de espacio de la BD
docker compose exec backend ls -lh /data/

# Backup manual de la BD
docker compose exec backend cp /data/kbotanas.db /data/kbotanas-$(date +%F).db
docker compose cp backend:/data/kbotanas.db ./backup-$(date +%F).db
```

### Backup automático diario

```bash
crontab -e
```

Pega esta línea:

```cron
0 3 * * * cd /opt/k-botanas && docker compose exec -T backend sh -c "cp /data/kbotanas.db /data/backup-$(date +\%F).db" && find /opt/k-botanas -name "backup-*.db" -mtime +30 -delete
```

(backup diario a las 03:00, conserva 30 días)

---

## 🆘 Troubleshooting

| Síntoma | Diagnóstico | Solución |
|---------|-------------|----------|
| `init-letsencrypt.sh` falla con "DNS problem" | DNS no propagó | Espera 10 min, `dig corte.kbomx.com` debe responder con la IP del Droplet |
| Login no funciona, F12 muestra CORS error | El meta `api-url` quedó mal | Verifica que `index.html` tenga `<meta name="api-url" content="/api" />` |
| 502 Bad Gateway | Backend caído | `docker compose logs backend` para ver el error |
| PWA no se actualiza tras un deploy | Service worker cacheando | En el navegador: F12 → Application → Service Workers → Update / Unregister |
| `docker compose: command not found` | Plugin no instalado | `apt install -y docker-compose-plugin` |
| El sitio carga pero no instala como PWA | Falta HTTPS | Verifica que estés entrando por `https://`, no `http://` |

### Renovación SSL

Certbot renueva automáticamente cada 12h dentro del contenedor. Para forzar:
```bash
docker compose run --rm certbot renew --force-renewal
docker compose exec nginx nginx -s reload
```

---

## 💰 Costo mensual

| Concepto | Costo |
|----------|-------|
| Droplet 1GB | $6 USD |
| Backups DO (opcional, +20%) | $1.20 USD |
| **Total** | **~$6–7 USD/mes** |

Para 4 usuarios y los movimientos de una empresa así, esto sobra de aquí a varios años.

---

## 🔁 Alternativa: DigitalOcean App Platform (sin Droplet)

Si prefieres no administrar un servidor, puedes usar **App Platform** (todo automático, deploy en cada push).

📁 Edita `.do/app.yaml`, cambia `TU-USUARIO-GITHUB`, y en DO:
**Apps → Create App → Edit App Spec → Paste YAML → Save → Deploy**

⚠️ **Limitación importante**: el plan básico de App Platform **no tiene volúmenes persistentes**, así que la BD SQLite se perdería en cada redeploy. Si vas por App Platform, hay que migrar a Postgres managed (~$15/mes adicional). Por eso recomiendo el Droplet.

---

## 📞 Siguientes pasos sugeridos

- [ ] Configurar backups automáticos al Spaces de DO o a un Google Drive
- [ ] Activar notificaciones por email cuando el Droplet baje (DO Monitoring → Alerts)
- [ ] Agregar un GitHub Action que haga `ssh root@droplet "cd /opt/k-botanas && ./deploy.sh"` automático en cada push a main
- [ ] Cambiar el `JWT_SECRET` cada 6 meses (rota credenciales)

---

🌶️ Hecho con ❤️ para K-BOTANAS · v1.0

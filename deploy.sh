#!/usr/bin/env bash
# deploy.sh — actualiza el código, copia el frontend y rearranca el backend
set -e

cd "$(dirname "$0")"

echo "### Pulling cambios desde GitHub ..."
git pull --ff-only

echo "### Sincronizando frontend a ./public ..."
mkdir -p public
# Lista blanca: solo archivos del frontend (excluye backend, docker, scripts)
rsync -av --delete \
  --exclude='backend/' \
  --exclude='Dockerfile' \
  --exclude='docker-compose.yml' \
  --exclude='nginx.conf' \
  --exclude='nginx-docker.conf' \
  --exclude='init-letsencrypt.sh' \
  --exclude='deploy.sh' \
  --exclude='public/' \
  --exclude='certbot/' \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='.env*' \
  --exclude='*.md' \
  --exclude='LICENSE' \
  --exclude='.dockerignore' \
  --exclude='.gitignore' \
  ./ ./public/

echo "### Rebuild backend y nginx ..."
docker compose build backend
docker compose up -d

echo "### Recargando nginx ..."
docker compose exec nginx nginx -s reload || true

echo "✅ Deploy completo. https://corte.kbomx.com"

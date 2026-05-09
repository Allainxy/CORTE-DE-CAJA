#!/usr/bin/env bash
# init-letsencrypt.sh — emite el certificado de Let's Encrypt la primera vez
# Basado en https://github.com/wmnnd/nginx-certbot

set -e

DOMAIN="corte.kbomx.com"
EMAIL="${EMAIL:-admin@kbomx.com}"   # se sobreescribe con .env
STAGING=0                           # ponlo a 1 para probar sin tocar el rate limit real

if ! [ -x "$(command -v docker)" ]; then
  echo "❌ docker no está instalado. Instálalo antes de continuar." >&2
  exit 1
fi

if [ -d "./certbot/conf/live/$DOMAIN" ]; then
  read -p "Ya existe un certificado para $DOMAIN. ¿Reemplazarlo? (y/N) " a
  if [ "$a" != "Y" ] && [ "$a" != "y" ]; then exit; fi
fi

# 1. Cargar parámetros TLS recomendados si no existen
if [ ! -e "./certbot/conf/options-ssl-nginx.conf" ] || [ ! -e "./certbot/conf/ssl-dhparams.pem" ]; then
  echo "### Descargando parámetros TLS recomendados ..."
  mkdir -p ./certbot/conf
  curl -sS https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "./certbot/conf/options-ssl-nginx.conf"
  curl -sS https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "./certbot/conf/ssl-dhparams.pem"
fi

# 2. Crear cert temporal "dummy" para que nginx pueda arrancar
echo "### Creando certificado temporal para $DOMAIN ..."
mkdir -p "./certbot/conf/live/$DOMAIN"
docker compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
    -keyout '/etc/letsencrypt/live/$DOMAIN/privkey.pem' \
    -out '/etc/letsencrypt/live/$DOMAIN/fullchain.pem' \
    -subj '/CN=localhost'" certbot

# 3. Levantar nginx con el cert temporal
echo "### Levantando nginx ..."
docker compose up --force-recreate -d nginx

# 4. Borrar el cert temporal
echo "### Borrando certificado temporal ..."
docker compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$DOMAIN && \
  rm -Rf /etc/letsencrypt/archive/$DOMAIN && \
  rm -Rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

# 5. Pedir el certificado real
echo "### Solicitando certificado de Let's Encrypt para $DOMAIN ..."
STAGING_ARG=""
if [ $STAGING != "0" ]; then STAGING_ARG="--staging"; fi

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $STAGING_ARG \
    --email $EMAIL \
    -d $DOMAIN \
    --rsa-key-size 4096 \
    --agree-tos \
    --force-renewal" certbot

echo "### Recargando nginx ..."
docker compose exec nginx nginx -s reload

echo "✅ Listo. Visita https://$DOMAIN"

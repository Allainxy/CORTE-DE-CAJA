FROM node:20-alpine

# better-sqlite3 necesita compilarse: añadimos toolchain mínima
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Instala dependencias (capa cacheable)
COPY backend/package.json ./
RUN npm install --omit=dev

# Copia el código del backend
COPY backend/ ./

# Carpeta persistente para la BD (volumen en docker-compose)
RUN mkdir -p /data
ENV DB_FILE=/data/kbotanas.db
ENV PORT=3001

EXPOSE 3001

# Inicializa la BD si no existe y arranca el server
CMD sh -c "node init-db.js || true; node server.js"

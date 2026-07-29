FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# No correr como root: una ejecución remota de código dentro del proceso
# quedaría con permisos de root del contenedor. La imagen de node ya trae el
# usuario 'node' sin privilegios.
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 5001

CMD ["node", "src/index.js"]

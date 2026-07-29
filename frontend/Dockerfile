# Etapa de build — REACT_APP_API_URL se inyecta en build time (ver vite.config.js)
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

# Vite necesita el index.html de la raíz y su configuración, además de las
# fuentes. Antes solo se copiaban public/ y src/, que era lo que pedía CRA.
COPY public ./public
COPY src ./src
COPY index.html vite.config.js ./

ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build

# Etapa de runtime — nginx sirviendo el build estático
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build args para REACT_APP_* (necesarios en build time)
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV GENERATE_SOURCEMAP=false

COPY . .
RUN npm run build

FROM node:20-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=builder /app/build ./build
# Railway inyecta PORT dinamicamente
CMD sh -c "serve -s build -l ${PORT:-3001}"

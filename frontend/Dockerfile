# La Biblioteca AH — web (Expo export) servida con `serve`.
# Multi-etapa, la MISMA versión fija de Node en las dos etapas, usuario no root y healthcheck (estándar 36).
ARG NODE_VERSION=20.18.1-alpine3.20

FROM node:${NODE_VERSION} AS construccion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG EXPO_PUBLIC_API_URL=http://localhost:8920
ARG EXPO_PUBLIC_MOCK=0
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_PUBLIC_MOCK=$EXPO_PUBLIC_MOCK \
    TZ=America/Bogota
# public/ (foliate-js, fuentes del lector, demo, serve.json) termina dentro de dist/.
RUN npx expo export --platform web \
 && test -f dist/foliate/view.js \
 && test -f dist/fuentes/Literata-Regular.ttf \
 && test -f dist/serve.json \
 && node scripts/csp.mjs dist/serve.json

FROM node:${NODE_VERSION} AS servidor
ENV NODE_ENV=production TZ=America/Bogota
RUN npm install -g serve@14.2.4 --no-audit --no-fund && npm cache clean --force
WORKDIR /app
COPY --from=construccion --chown=node:node /app/dist ./dist
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3100/ >/dev/null || exit 1
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:3100", "--no-clipboard"]

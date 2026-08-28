FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./package.json

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV LONGHOME_HOST=0.0.0.0
ENV LONGHOME_PORT=3000
ENV LONGHOME_DATA_DIR=/app/data
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["npm", "start"]

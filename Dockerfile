FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/postgres/schema.prisma ./prisma/postgres/schema.prisma
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build
FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma/postgres ./prisma/postgres
COPY --from=build --chown=node:node /app/package.json ./
USER node
EXPOSE 3000
CMD ["npm","start"]

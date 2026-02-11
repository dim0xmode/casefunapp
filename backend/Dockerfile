FROM node:20-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

RUN mkdir -p uploads

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

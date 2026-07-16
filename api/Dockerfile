FROM node:22-alpine AS development
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN mkdir -p /app/data

ENV NODE_ENV=development
ENV API_HOST=0.0.0.0
ENV API_PORT=8787

EXPOSE 8787
CMD ["npx", "tsx", "watch", "src/index.ts"]

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=8787

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data

EXPOSE 8787
CMD ["node", "dist/index.js"]

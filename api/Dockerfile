FROM node:22-alpine
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

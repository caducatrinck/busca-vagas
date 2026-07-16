FROM node:22-alpine AS development
WORKDIR /app

ARG VITE_API_URL=http://localhost:8787
ENV VITE_API_URL=$VITE_API_URL

COPY package.json ./
RUN npm install

COPY index.html ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts ./
COPY public ./public
COPY src ./src

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_API_URL=http://localhost:8787
ENV VITE_API_URL=$VITE_API_URL

COPY package.json ./
RUN npm install

COPY index.html ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts ./
COPY public ./public
COPY src ./src

RUN npm run build

FROM nginx:1.27-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared ./shared
RUN npm install

FROM base AS build
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app .
RUN npm install --omit=dev
EXPOSE 8080
CMD ["npm", "run", "dev:server"]

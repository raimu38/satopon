FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 権限変更不要：最初からnode:nodeになっている
USER node

EXPOSE 3002

CMD ["npm", "run", "dev"]

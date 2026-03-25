FROM node:22-alpine

WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci --ignore-scripts

COPY . .

RUN npm run type-check

CMD ["node", "--version"]

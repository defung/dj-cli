# AS builder
FROM node:22-trixie-slim

ENV NODE_PATH /usr/local/lib/node_modules

RUN apt update && apt install -y mkvtoolnix

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci && npm cache clean --force
RUN npm install -g @actual-app/api

# Copy compile/build configs
COPY build*.js *config.json ./

# Copy source code
COPY src ./src

RUN npm run build:docker && \
    chmod +x ./dist/bundled/bundle.js && \
    mv ./dist/bundled/bundle.js /usr/local/bin/dj

ENTRYPOINT ["dj"]

CMD ["--help"]

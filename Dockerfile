# AS builder
FROM node:26-slim

ENV NODE_PATH=/usr/local/lib/node_modules

RUN apt update && apt install -y mkvtoolnix vim bash curl

# Install lapse subtitle sync engine (architecture-aware)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then LAPSE_ARCH="amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then LAPSE_ARCH="arm64"; \
    else echo "Unsupported architecture: $ARCH" && exit 1; fi && \
    curl -L -o /tmp/lapse-linux-${LAPSE_ARCH}.tar.gz \
        https://github.com/Schwponaco-org/lapse/releases/latest/download/lapse-linux-${LAPSE_ARCH}.tar.gz && \
    tar -xzf /tmp/lapse-linux-${LAPSE_ARCH}.tar.gz -C /tmp && \
    mv /tmp/lapse-linux-${LAPSE_ARCH}/lapse /usr/local/bin/lapse && \
    chmod +x /usr/local/bin/lapse && \
    rm -rf /tmp/lapse-linux-${LAPSE_ARCH} /tmp/lapse-linux-${LAPSE_ARCH}.tar.gz && \
    lapse --version

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

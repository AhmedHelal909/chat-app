FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first so Docker can cache this layer
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Then copy the source code
COPY . .

# Run as the non-root "node" user; it must own the uploads folder
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]

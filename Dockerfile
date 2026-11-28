FROM node:22-slim

WORKDIR /app

# Install dependencies (including tsx for running server.ts directly)
COPY package.json package-lock.json* .npmrc* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Copy source and build production frontend bundle
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npx", "tsx", "server.ts"]

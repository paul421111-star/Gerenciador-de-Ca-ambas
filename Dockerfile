FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && mkdir -p /app/data /app/backups && chown -R node:node /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/jr.sqlite
ENV BACKUP_DIR=/app/backups
ENV NEXT_TELEMETRY_DISABLED=1
USER node
EXPOSE 3000
CMD ["npm", "start"]

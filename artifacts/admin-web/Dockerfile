FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY scripts/package.json scripts/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY artifacts/admin-web/package.json artifacts/admin-web/package.json
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/attendee-api/package.json artifacts/attendee-api/package.json
COPY artifacts/attendee-app/package.json artifacts/attendee-app/package.json
COPY artifacts/mobile/package.json artifacts/mobile/package.json
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/package.json
RUN pnpm install --frozen-lockfile
COPY lib/api-client-react/ lib/api-client-react/
COPY artifacts/admin-web/ artifacts/admin-web/
COPY attached_assets/ attached_assets/
RUN pnpm --filter @workspace/admin-web run build
RUN pnpm --filter @workspace/admin-web deploy --prod /app/deploy

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/deploy/node_modules ./node_modules
COPY --from=build /app/deploy/package.json ./package.json
COPY --from=build /app/artifacts/admin-web/dist/public ./dist/public
COPY --from=build /app/artifacts/admin-web/server ./server
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/index.js"]

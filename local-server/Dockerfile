FROM node:24-alpine
RUN npm install -g pnpm@latest

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json tsconfig.json ./

# Copy workspace packages the api-server depends on
COPY lib/db/ ./lib/db/
COPY lib/api-zod/ ./lib/api-zod/
COPY lib/api-spec/ ./lib/api-spec/
COPY artifacts/api-server/ ./artifacts/api-server/

# Install deps and build
RUN pnpm install --frozen-lockfile
WORKDIR /app/artifacts/api-server
RUN pnpm run build

CMD ["pnpm", "run", "start"]

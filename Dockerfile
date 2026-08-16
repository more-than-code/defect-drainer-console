# syntax=docker/dockerfile:1
# defect-drainer-console — Vite SPA served by nginx (proxies API to backend).

ARG NODE_VERSION=22
ARG PNPM_VERSION=11.1.3

FROM node:${NODE_VERSION}-slim AS build
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-dd-console,target=/pnpm/store \
	pnpm install --no-frozen-lockfile --config.dangerouslyAllowAllBuilds=true
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN pnpm build

FROM docker.io/library/nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

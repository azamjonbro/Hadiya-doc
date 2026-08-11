# Build context is the repo root — same reasoning as backend/Dockerfile:
# front/ depends on packages/shared via npm workspaces.

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY front/package.json front/
RUN npm ci --workspace front --workspace @lms/shared --include-workspace-root

COPY packages/shared packages/shared
COPY front front

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build --workspace front

FROM nginx:1.27-alpine
COPY front/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/front/dist /usr/share/nginx/html
EXPOSE 80

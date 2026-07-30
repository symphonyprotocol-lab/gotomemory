# No `# syntax=` directive on purpose: this file uses no BuildKit-only features,
# and the directive makes every build resolve an external frontend image first,
# which is one more thing that can be slow or unreachable.
#
# The gotomemory.dev site: built in a Node stage, served by nginx. Build context
# is the repo ROOT, not apps/web — the site imports @gotomemory/i18n from the
# workspace, so the whole pnpm workspace has to be present to install and build.
#
#   docker build -f apps/web/Dockerfile -t gotomemory-web .

FROM node:22-alpine AS build

# corepack picks the pnpm version pinned in package.json's packageManager field;
# the prompt would otherwise block a non-interactive build.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /repo
COPY . .

RUN pnpm install --frozen-lockfile

# The trailing "..." builds @gotomemory/i18n first. Without it the web package's
# `tsc` step resolves the dependency to a stale or missing dist/ and fails.
RUN pnpm turbo run build --filter=@gotomemory/web...

FROM nginx:1.27-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# busybox wget, since the alpine image ships no curl.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

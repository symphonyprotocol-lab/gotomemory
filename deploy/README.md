# Deploying gotomemory.dev

`.github/workflows/deploy.yml` runs after `ci` succeeds on `main` — merging a PR
is the trigger. It builds `apps/web` into an nginx image, pushes it to GHCR
tagged with the commit SHA, copies the compose files to the server, and restarts
the stack. Two services run there:

| Service  | Serves                  | Container port   | Content comes from             |
| -------- | ----------------------- | ---------------- | ------------------------------ |
| `web`    | `gotomemory.dev`        | `127.0.0.1:8080` | Baked into the GHCR image      |
| `config` | `config.gotomemory.dev` | `127.0.0.1:8081` | `selector-config/` on the host |

Both bind to loopback only. TLS and the public ports stay with the reverse proxy
already running on the host.

## One-time server setup

```bash
sudo mkdir -p /srv/gotomemory/selector-config
sudo chown -R "$USER" /srv/gotomemory
```

Point the reverse proxy at the two loopback ports — `gotomemory.dev` →
`127.0.0.1:8080`, `config.gotomemory.dev` → `127.0.0.1:8081` — and make sure both
hostnames resolve to the server and have certificates.

## One-time GitHub setup

Create a `production` environment (Settings → Environments) and add these
secrets to it:

| Secret               | What it is                                                       |
| -------------------- | ---------------------------------------------------------------- |
| `DEPLOY_HOST`        | Server hostname or IP                                            |
| `DEPLOY_USER`        | SSH user, must be in the `docker` group                          |
| `DEPLOY_SSH_KEY`     | Private key, whole PEM including the BEGIN/END lines             |
| `DEPLOY_KNOWN_HOSTS` | Output of `ssh-keyscan -H <host>`                                |
| `DEPLOY_PATH`        | Directory holding the compose files, e.g. `/srv/gotomemory`      |
| `DEPLOY_PORT`        | Optional, defaults to `22`                                       |
| `DEPLOY_WEB_PORT`    | Optional, defaults to `8080`; only used by the post-deploy check |
| `GHCR_PULL_TOKEN`    | Optional — see below                                             |

Generate a deploy-only key rather than reusing a personal one:

```bash
ssh-keygen -t ed25519 -C "gotomemory-deploy" -f ./gotomemory-deploy -N ""
```

Append `gotomemory-deploy.pub` to the server's `~/.ssh/authorized_keys`, put the
private half in `DEPLOY_SSH_KEY`, and delete the local copies.

### Pulling from GHCR

The package is private until you change it, so the server cannot pull without
credentials. Either:

- make it public once it exists (Package settings → Change visibility) and leave
  `GHCR_PULL_TOKEN` unset — the deploy script skips `docker login`; or
- create a classic PAT with only `read:packages` and store it as
  `GHCR_PULL_TOKEN`.

The image contains nothing but the already-public site, so public is the simpler
choice.

## Publishing a selector-override document

The `config` service serves whatever is in `selector-config/` on the host, so a
selector hot-fix does not need a site release:

```bash
pnpm --filter @gotomemory/selector-signing run sign -- --version <n> ...
scp selector-overrides.v1.json <user>@<host>:/srv/gotomemory/selector-config/
```

See `tooling/selector-signing/README.md` for the signing runbook. Until
`SELECTOR_OVERRIDES_PUBLIC_KEY` in `apps/extension/src/selector-config.ts` holds
a real key, every document fails verification and extensions keep their built-in
selectors — so publishing one has no effect yet.

## Rolling back

The running version is pinned in `.env`, and the previous value is kept beside
it:

```bash
cd /srv/gotomemory
cat .env.previous          # WEB_IMAGE=ghcr.io/...-web:<older-sha>
cp .env.previous .env
docker compose up -d
```

Every build stays in GHCR under its SHA, so any past commit can be restored the
same way. A manual redeploy of a specific commit is Actions → deploy → Run
workflow → set `ref`.

## Checking a deploy

```bash
docker compose ps
docker compose logs --tail=50 web
curl -I http://127.0.0.1:8080/privacy/
```

The workflow itself curls `/` and `/privacy/` after restarting and fails if
either does not return 200.

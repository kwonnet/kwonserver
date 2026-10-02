# Automatic kwonserver deployment

Push to `main` (or run the deployment workflow manually). GitHub tests/builds
kwonserver, publishes an immutable image to Artifact Registry, uploads the deploy
script over IAP, and installs/starts Docker containers on the VM. No Compose
file, manual install command or separate initialization run is required.

Only kwonserver and its BullMQ worker deploy here. kwonweb, kwonrec and existing
PostgreSQL, MongoDB and Redis remain on their current hosts.

## GitHub configuration

Use **Settings → Environments → production → Environment secrets**:

- GCP_COMPUTE_ENGINE_PROJECT
- GCP_COMPUTE_ENGINE_ZONE
- GCP_COMPUTE_ENGINE_NAME
- GCP_WIF_PROVIDER
- GCP_DEPLOY_SERVICE_ACCOUNT
- GAR_LOCATION
- GCP_COMPUTE_ENGINE_EXTERNAL_IP (optional reference for DNS; IAP does not use it)

Also add **KWONSERVER_ENV**, a multiline secret containing the complete application
runtime configuration currently used on Cloud Run. The seven infrastructure
secrets do not supply database credentials or application settings. If this
secret is empty, deployment reuses `/opt/kwonnet/env/kwonserver.env` if it exists;
otherwise it fails with a clear error. A supplied secret replaces the whole file.

Use Docker env-file format: one KEY=value per line, no `export`, no surrounding
quotes, no variable interpolation. Include all existing production settings,
plus API_DOMAIN and ACME_EMAIL for automatic HTTPS, for example:

```dotenv
API_DOMAIN=api.example.com
ACME_EMAIL=admin@example.com
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
REDIS_URL=redis://HOST:6379
MONGO_URL=mongodb://HOST/DATABASE
JWT_SECRET=YOUR_EXISTING_SECRET
ENCRYPTION_KEY=YOUR_EXISTING_KEY
REMOTE_APP_URL=https://YOUR_EXISTING_WEB_DOMAIN
KWONREC_API=http://REACHABLE_PRIVATE_RECOMMENDER_ADDRESS:8001
KWONREC_API_KEY=YOUR_EXISTING_SERVICE_KEY
JOBS_TIMEZONE=UTC
```

Include your existing payment, email, storage, push and AI credentials too.
Keep existing JWT/encryption keys and data service URLs. Set
DATABASE_MIGRATION_URL if Prisma needs a direct database URL rather than the
runtime transaction pooler. The script preserves existing VM env files in a
root-only history directory before replacing them. It never prints their values.

## Infrastructure prerequisites

The configured WIF identity must already have permission to push to the `kwonnet`
Docker repository in GAR_LOCATION and use IAP/OS Admin Login on this VM. The
Artifact Registry repository must exist. Enable OS Login on the VM, allow IAP SSH
from 35.235.240.0/20, and grant Service Account User on the VM's attached service
account where required. Adding GitHub secrets alone does not grant IAM access.
The workflow uses its short-lived registry token for pulling images, so a separate
VM registry credential is unnecessary.

Use Debian/Ubuntu on the VM. Docker is installed automatically if absent; Python3
is installed if needed. The VM needs outbound access to package repositories,
Artifact Registry and your data services. Reserve a static external IP, point
API_DOMAIN's DNS A record at it, remove conflicting AAAA records, and allow public
TCP 80/443. Ports 8000, 8001 and database ports should stay private. Ports 80/443
must be free on the target VM for the HTTPS proxy.

Before first deployment, disable any previous GitHub/Cloud Build trigger that
deploys this same backend elsewhere. Disable background jobs on the old Cloud
Run API and stop old kwonserver workers before enabling the new one. Keep kwonrec's
own worker running. On a new VM, the old VM's localhost/Docker hostnames are not
reachable: configure private network access to kwonrec and your data services.
The earlier manual Compose deployment should not run alongside this one.

## What happens on push

1. Existing unit/regression/integration/e2e tests run.
2. GitHub builds and publishes the image; production env values are not baked in.
3. The VM validates runtime configuration and the HTTPS proxy, then runs Prisma
   migrations/reference seeding before replacing containers.
4. Docker starts `kwonserver`, `kwonserver-worker`, and `kwonserver-proxy`.
5. Deployment waits for API health, tests the Socket.IO handshake, and checks that
   the worker has not exited/restarted. Authenticated chat/game flows and actual
   job processing still need functional monitoring.

A migration failure leaves existing containers running. Failures after
replacement may leave the attempted release running; the workflow reports
failure. There is no automatic database rollback. `/opt/kwonnet/image` records
the last successful image; previous records are in `/opt/kwonnet/history`.
Revert a code commit and push to redeploy only if its schema remains compatible.

Docker restart policies survive VM reboot. Deployments briefly disconnect sockets.
Caddy keeps certificates in persistent Docker volumes and renews them automatically.
Do not delete these volumes. Application data stays in the existing external
services. Keep one API replica while games/Socket.IO rooms use local process state.

View logs if needed (deployment itself requires no manual VM command):

```bash
sudo docker logs --tail=100 kwonserver
sudo docker logs --tail=100 kwonserver-worker
sudo docker logs --tail=100 kwonserver-proxy
```

After the first release, verify public HTTPS, login, chat, games and recommendations
before retiring Cloud Run. Update the existing frontend's NEXT_PUBLIC_API_URL if
the public API hostname changes. This workflow does not deploy the frontend.

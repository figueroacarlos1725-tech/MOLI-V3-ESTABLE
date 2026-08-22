# Moli QA on the shared VPS

This deployment is intentionally isolated from the existing Moli bot and Comprax:

- separate Compose project (`moli-qa`)
- separate MongoDB volume and database (`moli_qa`)
- no published host ports
- access only through the shared Caddy route `/moli-qa/`

Create a local `.env` on the VPS with a randomly generated `SECRET_KEY`; never commit it.

```sh
docker compose -p moli-qa -f deploy/qa/docker-compose.yml up -d --build
```

Expected health probe after the Caddy fragment is installed:

```sh
curl http://127.0.0.1/moli-qa/api/
```

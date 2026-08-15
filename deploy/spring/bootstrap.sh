#!/usr/bin/env bash
# Installs what this box is missing for the LMS backend, and nothing else.
#
# Safe to re-run. It deliberately does NOT restart nginx or touch any config
# belonging to the six other sites on this machine — the nginx step is done by
# hand afterwards, with `nginx -t` before every reload.
set -euo pipefail

APP_DIR=/opt/spring-lms
DATA_DIR=/var/lib/minio
BUCKETS="lms-originals lms-processed lms-images lms-materials lms-chat"

echo "==> Ports in use (4000 must be free)"
ss -lntp | awk 'NR==1 || /:(4000|6379|9000|9001)\b/'

echo "==> Redis (loopback only)"
if ! command -v redis-server >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq redis-server
fi
# Bind to loopback and cap memory: this box has ~860 MB free and six other
# sites on it, so Redis must never be the reason one of them gets OOM-killed.
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
grep -q '^maxmemory ' /etc/redis/redis.conf || echo 'maxmemory 128mb' >> /etc/redis/redis.conf
grep -q '^maxmemory-policy ' /etc/redis/redis.conf || echo 'maxmemory-policy noeviction' >> /etc/redis/redis.conf
systemctl enable --now redis-server
systemctl restart redis-server
redis-cli ping

echo "==> MinIO (loopback only, never proxied by nginx)"
if [ ! -x /usr/local/bin/minio ]; then
  curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /usr/local/bin/minio
  chmod +x /usr/local/bin/minio
fi
if [ ! -x /usr/local/bin/mc ]; then
  curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
fi
id -u minio-user >/dev/null 2>&1 || useradd -r -s /sbin/nologin minio-user
mkdir -p "$DATA_DIR"
chown -R minio-user: "$DATA_DIR"

if [ ! -f /etc/default/minio ]; then
  MINIO_PASS=$(openssl rand -hex 20)
  cat > /etc/default/minio <<ENV
MINIO_ROOT_USER=lms
MINIO_ROOT_PASSWORD=$MINIO_PASS
MINIO_VOLUMES=$DATA_DIR
MINIO_OPTS="--address 127.0.0.1:9000 --console-address 127.0.0.1:9001"
ENV
  chmod 600 /etc/default/minio
  echo "    generated MinIO password -> /etc/default/minio"
fi

cat > /etc/systemd/system/minio.service <<'UNIT'
[Unit]
Description=MinIO
After=network-online.target
Wants=network-online.target

[Service]
User=minio-user
Group=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=always
RestartSec=5
MemoryMax=256M

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now minio
sleep 3

# shellcheck disable=SC1091
. /etc/default/minio
mc alias set lms http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
for b in $BUCKETS; do mc mb --ignore-existing "lms/$b" >/dev/null && echo "    bucket $b"; done

echo "==> Backend service"
mkdir -p "$APP_DIR"
cat > /etc/systemd/system/spring-lms.service <<UNIT
[Unit]
Description=Spring LMS backend
After=network-online.target mongod.service redis-server.service minio.service
Wants=network-online.target

[Service]
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/backend/.env
ExecStart=$(command -v node) src/server.js
Restart=always
RestartSec=5
# One process, 1.9 GB box, six neighbours: keep it boxed in.
MemoryMax=512M
StandardOutput=append:/var/log/spring-lms.log
StandardError=append:/var/log/spring-lms.log

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload

echo "==> Done. Next: ship the code + .env to $APP_DIR, then"
echo "    systemctl enable --now spring-lms && curl -s localhost:4000/api/v1/health"

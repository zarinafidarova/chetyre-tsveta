#!/usr/bin/env bash
# Выкатывает свежую версию: забирает код из git, собирает фронт и сервер, перезапускает службу.
# Запуск на сервере (от root): bash /var/www/chetyre-tsveta/deploy/update.sh
#
# Фронт собирается в отдельную папку и подменяет web/dist в конце, так что сайт не пропадает во время сборки.
# Сервер перезапускается, только если бинарник изменился: при правках одного фронта партии не обрываются.
# Если после перезапуска сервер не ответил, скрипт вернёт прошлую версию.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

SERVICE=uno
ADDR=127.0.0.1:8095          # должен совпадать с HTTP_ADDR в deploy/uno.service и портом в конфиге nginx
BIN="$ROOT/bin/uno-server"
UNIT="/etc/systemd/system/$SERVICE.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запусти от root: sudo bash $0" >&2
  exit 1
fi

# ---------- код ----------
echo "→ git pull"
git fetch --quiet
# npm на сервере создаёт свой web/package-lock.json. Если такой файл появился в репозитории,
# серверный убираем, иначе git pull откажется его перезаписывать.
if ! git ls-files --error-unmatch web/package-lock.json >/dev/null 2>&1 \
   && git cat-file -e "@{u}:web/package-lock.json" 2>/dev/null; then
  rm -f web/package-lock.json
fi
git pull --ff-only --quiet

# ---------- инструменты ----------
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 18 ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
  set +u; . "$HOME/.nvm/nvm.sh"; nvm use 22 >/dev/null 2>&1 || nvm install 22; set -u
fi
if [ "$(node_major)" -lt 18 ]; then
  echo "Нужен Node.js 18 или новее, сейчас: $(node -v 2>/dev/null || echo 'не установлен'). См. README." >&2
  exit 1
fi

GO="$(command -v go || true)"
if [ -z "$GO" ] && [ -x /usr/local/go/bin/go ]; then GO=/usr/local/go/bin/go; fi
if [ -z "$GO" ]; then
  echo "Не найден Go (нужен 1.22 или новее). См. README." >&2
  exit 1
fi

# ---------- фронт ----------
echo "→ сборка фронта"
(
  cd web
  if git ls-files --error-unmatch package-lock.json >/dev/null 2>&1; then
    npm ci --no-audit --no-fund --loglevel=error
  else
    npm install --no-audit --no-fund --loglevel=error
  fi
  npx vite build --outDir .dist-new --emptyOutDir --logLevel warn
)
rm -rf web/.dist-old
if [ -d web/dist ]; then mv web/dist web/.dist-old; fi
mv web/.dist-new web/dist
rm -rf web/.dist-old
chmod -R u=rwX,go=rX web/dist

# ---------- сервер ----------
echo "→ сборка сервера"
mkdir -p bin
CGO_ENABLED=0 "$GO" build -trimpath -buildvcs=false -ldflags="-s -w" -o bin/uno-server.new .
chmod 755 bin/uno-server.new

# служба systemd: ставим или обновляем из deploy/uno.service
unit_changed=0
tmp="$(mktemp)"
sed "s#@ROOT@#$ROOT#g" deploy/uno.service > "$tmp"
if ! cmp -s "$tmp" "$UNIT"; then
  install -m 644 "$tmp" "$UNIT"
  systemctl daemon-reload
  unit_changed=1
fi
rm -f "$tmp"
systemctl enable --quiet "$SERVICE"

healthy() {
  for _ in $(seq 1 15); do
    curl -fsS "http://$ADDR/healthz" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

if [ -f "$BIN" ] && cmp -s bin/uno-server.new "$BIN" && [ "$unit_changed" -eq 0 ] \
   && systemctl is-active --quiet "$SERVICE"; then
  rm -f bin/uno-server.new
  echo "→ сервер не изменился, перезапуск не нужен: партии продолжаются"
else
  if [ -f "$BIN" ]; then cp -f "$BIN" "$BIN.prev"; fi
  mv bin/uno-server.new "$BIN"
  echo "→ перезапуск сервера"
  systemctl restart "$SERVICE"
  if ! healthy; then
    echo "Сервер не ответил на $ADDR. Последние строки лога:" >&2
    journalctl -u "$SERVICE" -n 20 --no-pager >&2 || true
    if [ -f "$BIN.prev" ]; then
      mv -f "$BIN.prev" "$BIN"
      systemctl restart "$SERVICE"
      echo "Вернула прошлую версию сервера." >&2
    fi
    exit 1
  fi
fi

if ! grep -rqs "uno.brayan-train.ru" /etc/nginx/sites-enabled /etc/nginx/conf.d; then
  echo "Внимание: сайт ещё не подключён в nginx, см. «Первый запуск на сервере» в README."
fi

echo "Готово: выкачена версия $(git rev-parse --short HEAD)"

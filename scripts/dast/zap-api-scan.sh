#!/usr/bin/env bash
# why:
#   ZAP API Scan を OpenAPI 定義経由で実行する。
#   Active Scan で SQLi / XSS / Path Traversal / SSRF 等の攻撃ペイロードを
#   各エンドポイントに投げ込み、API レイヤの脆弱性を検出する。
#
#   B (Full Scan) より先に C (API Scan) を回す方針:
#     クロールでは見つけられない API も OpenAPI に明記されているため取りこぼしが減る。
#     Full Scan の前段で API レイヤを潰しておくとノイズが減って効率が良い。
#
# 前提:
#   - Docker が起動している (zaproxy/zap-stable イメージを pull する)
#   - 対象は AWS test 環境 (https://test.okamomedia.tokyo) 想定
#   - 認証必須エンドポイントには SESSION_JWT 環境変数で session cookie 値を渡す
#       export SESSION_JWT="$(ブラウザ DevTools → Cookies → session の値)"
#     未指定の場合は未ログイン状態でスキャンする (401/403 が大量に出る)
#
# 使い方:
#   ./scripts/dast/zap-api-scan.sh
#   SESSION_JWT="eyJ..." ./scripts/dast/zap-api-scan.sh
#
# レポート:
#   zap-reports/api-scan-report.html / api-scan-report.json
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${REPO_ROOT}/zap-reports"
OPENAPI_FILE="scripts/dast/openapi.yaml"
TARGET_BASE="${TARGET_BASE:-https://test.okamomedia.tokyo}"

mkdir -p "${REPORT_DIR}"

# why:
#   ZAP container 内で OpenAPI ファイルを参照させるため、リポジトリ全体を
#   /zap/wrk にマウントする。レポートは同じ場所に書き出されるので
#   ホスト側の zap-reports/ にそのまま落ちる。
DOCKER_ARGS=(
  --rm
  -v "${REPO_ROOT}:/zap/wrk/:rw"
  -t zaproxy/zap-stable
  zap-api-scan.py
  -t "/zap/wrk/${OPENAPI_FILE}"
  -f openapi
  -O "${TARGET_BASE}"
  -r zap-reports/api-scan-report.html
  -J zap-reports/api-scan-report.json
  -d   # debug: 進行状況を stderr に出す
)

# Replacer で全リクエストに Cookie を強制注入する。
# why: ZAP は OpenAPI の securitySchemes (apiKey in cookie) を「セッション保持」には
#      使ってくれない。Replacer で Cookie ヘッダを上書きする方式が一番確実。
if [[ -n "${SESSION_JWT:-}" ]]; then
  echo "[zap-api-scan] SESSION_JWT を Cookie ヘッダに注入してスキャンします" >&2
  DOCKER_ARGS+=(
    -z "-config replacer.full_list(0).description=session
        -config replacer.full_list(0).enabled=true
        -config replacer.full_list(0).matchtype=REQ_HEADER
        -config replacer.full_list(0).matchstr=Cookie
        -config replacer.full_list(0).regex=false
        -config replacer.full_list(0).replacement=session=${SESSION_JWT}"
  )
else
  echo "[zap-api-scan] SESSION_JWT 未指定: 未ログイン状態でスキャンします" >&2
fi

echo "[zap-api-scan] 開始: target=${TARGET_BASE}" >&2
exec docker run "${DOCKER_ARGS[@]}"

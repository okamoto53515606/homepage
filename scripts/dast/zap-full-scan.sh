#!/usr/bin/env bash
# why:
#   ZAP Full Scan で UI 側 (RSC / 静的アセット / Cognito Hosted UI 経由のフロー) も含め
#   サイト全体を能動的にスキャンする。Spider クロール + Active Scan の組合せで
#   API Scan では拾えなかった HTML フォーム / リンク経由の脆弱性を検出する。
#
#   実行時間: 30〜120 分 (サイト規模 + アタックインテンシティに依存)
#   Baseline (受動のみ) は Full Scan に内包されるためここで一気にカバーする。
#
# 前提:
#   - Docker が起動している
#   - SESSION_JWT を渡すと管理画面 (/admin) も含めてクロールされる
#       未指定なら一般ユーザー視点 (公開ページ + ログインモーダルまで)
#
# 除外:
#   - Stripe Webhook Proxy Lambda (AuthType: NONE で公開、署名検証で全部 400 になる
#     のでスキャンしてもノイズしか出ない)
#   - 外部リダイレクト先 (Stripe Hosted Checkout / Cognito Hosted UI / Google OAuth)
#     は ZAP がデフォルトで In-Scope 外として扱うため明示除外不要
#
# 使い方:
#   ./scripts/dast/zap-full-scan.sh
#   SESSION_JWT="eyJ..." ./scripts/dast/zap-full-scan.sh
#
# レポート:
#   zap-reports/full-scan-report.html / full-scan-report.json
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${REPO_ROOT}/zap-reports"
TARGET_URL="${TARGET_URL:-https://test.okamomedia.tokyo/}"

mkdir -p "${REPORT_DIR}"

DOCKER_ARGS=(
  --rm
  -v "${REPO_ROOT}:/zap/wrk/:rw"
  -t zaproxy/zap-stable
  zap-full-scan.py
  -t "${TARGET_URL}"
  -r zap-reports/full-scan-report.html
  -J zap-reports/full-scan-report.json
  -d
)

# why: 認証 cookie を全リクエストに注入。Spider が /admin/** までたどれる。
if [[ -n "${SESSION_JWT:-}" ]]; then
  echo "[zap-full-scan] SESSION_JWT を Cookie ヘッダに注入してスキャンします" >&2
  DOCKER_ARGS+=(
    -z "-config replacer.full_list(0).description=session
        -config replacer.full_list(0).enabled=true
        -config replacer.full_list(0).matchtype=REQ_HEADER
        -config replacer.full_list(0).matchstr=Cookie
        -config replacer.full_list(0).regex=false
        -config replacer.full_list(0).replacement=session=${SESSION_JWT}"
  )
else
  echo "[zap-full-scan] SESSION_JWT 未指定: 未ログインのみで Spider する (/admin はカバー不可)" >&2
fi

echo "[zap-full-scan] 開始: target=${TARGET_URL}" >&2
exec docker run "${DOCKER_ARGS[@]}"

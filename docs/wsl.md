# 配布用 WSL イメージの作成メモ

> **why:** 一般ユーザーが `homepage-v2` をローカルでセットアップできるよう、必要なツール（Node.js / Docker / AWS CLI / プロジェクトコード）を全部入りで構成済みの WSL イメージを GitHub Releases で配布する。受け取り側は `wsl --import` するだけで、`http://localhost:3001` のセットアップ画面に進める状態を作る。

## 前提

- **Windows 11**（`wsl --install` がワンコマンドで Ubuntu 導入できるバージョン）。Windows 10 はサポート対象外。
- インストール後の Ubuntu はクリーンな状態から構築し、`git clone`（`tar -xz`）以外のソースを混入させない。これにより配布物に個人情報が混入しない（リポジトリは public で個人情報なし、`.env` は `env_template.txt` のコピーのみ）。

## 全体フロー

1. **Windows**: クリーンな Ubuntu WSL を作成
2. **WSL (Ubuntu)**: 必要ツール導入 → リポジトリ取得 → ビルド → 起動スクリプト配置
3. **Windows**: `wsl --export` で tar 化
4. **WSL**: tar を gzip 圧縮 + sha256 算出
5. **Windows**: `gh release create` で GitHub Release にアップロード

各ステップでコマンドの実行場所が **Windows (PowerShell)** か **WSL (Ubuntu)** かを明示する。

---

## 1. WSL ディストリビューション作成 (Windows)

PowerShell を**管理者権限**で起動。

```powershell
wsl --install
# ダウンロード中: Ubuntu
# インストール中: Ubuntu
# ディストリビューションが正常にインストールされました。'wsl.exe -d Ubuntu' を使用して起動できます
```

> 既に Ubuntu が入っている場合は `wsl --unregister Ubuntu` で破棄してから再 install すること（クリーンな状態でイメージを作るため）。

```powershell
wsl.exe -d Ubuntu
```

初回起動時に Unix ユーザー作成を求められる:

```text
Create a default Unix user account: ubuntu
New password: ********
Retype new password: ********
passwd: password updated successfully
```

> **why:** ユーザー名を `ubuntu` 固定にするのは、配布後の起動コマンド `wsl -d Ubuntu -u ubuntu -- bash -i /home/ubuntu/homepage/setup/start.sh` を全環境で同じパスで動かすため。

---

## 2. sudo を NOPASSWD 化 (WSL)

WSL 上で:

```bash
sudo visudo
```

末尾に追記:

```text
%sudo   ALL=(ALL:ALL) ALL
ubuntu  ALL=(ALL) NOPASSWD: ALL
```

`Ctrl+O` → `Enter` で保存、`Ctrl+X` で終了。

> **why:** 配布後ユーザーが setup 画面から内部的に sudo を呼ぶため、対話式パスワード入力で詰まらないようにする。

一旦抜ける:

```bash
exit
```

---

## 3. ベースツール導入 (WSL)

```bash
wsl.exe -d Ubuntu      # Windows 側で再起動
```

```bash
cd ~
sudo apt-get -y install zip
```

### AWS CLI v2

```bash
# why: setup 画面が aws CLI / SDK のクレデンシャル参照を前提にしている
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version   # aws-cli/2.x.x ...
```

### Node.js (nvm 経由で Node 22)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
source ~/.bashrc
nvm --version
nvm install 22
nvm use 22
```

> **why:** Next.js 16 / aws-cdk-lib の最新が要求する Node 20+ を満たすため、長期サポートの 22 を採用。

### apt 全体更新 + 開発ツール

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common \
  git unzip build-essential python3 make gcc
```

### Docker (CDK / Lambda コンテナビルドで必須)

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io
sudo usermod -aG docker $USER
newgrp docker

# 動作確認
docker run hello-world
sudo systemctl enable docker
```

> **why:** `npx cdk deploy` 時に Lambda コンテナイメージを Docker でビルドする。Docker daemon が起動している必要があるので、`systemctl enable` で次回 WSL 起動時に自動起動させる。

---

## 4. リポジトリ取得 (WSL)

```bash
mkdir -p ~/homepage
cd ~/homepage
curl -L https://github.com/okamoto53515606/homepage/archive/refs/heads/main.tar.gz \
  | tar -xz --strip-components=1

# why: 配布イメージサイズ削減 & ユーザーが触る必要のないファイルを除く
rm -rf migration_project_v1_to_v2 docs prompt_history

cp env_template.txt .env
```

---

## 5. 環境チェック (WSL)

すべてバージョンが出ること、Docker daemon が OK であることを確認。

```bash
echo "=== versions ===" && \
node -v && npm -v && \
aws --version && \
docker --version && (docker info >/dev/null 2>&1 && echo "docker daemon: OK" || echo "docker daemon: NG") ; \
git --version && \
make --version | head -1 && \
gcc --version | head -1 && \
python3 --version && \
curl --version | head -1 && \
unzip -v | head -1
```

---

## 6. 依存インストール & ビルド (WSL)

> **why:** 配布後の初回起動を高速化するため、`npm install` と setup の `next build` を配布側で済ませて `node_modules` / `.next` ごとイメージに固める。  
> ルート (`~/homepage`) は CDK 用依存だけが必要 (`aws-cdk-lib`, `@types/node` 等)。Next.js 本体の build はランタイムでは Lambda コンテナビルド経由で行うため不要。

```bash
# ルート: CDK 用依存のみ
cd ~/homepage
rm -rf node_modules .next
npm install

# setup: 依存 + Next.js プロダクションビルド
cd ~/homepage/setup
rm -rf node_modules .next
npm install
npm run build
```

---

## 7. 起動スクリプト配置 (WSL)

```bash
cat > ~/homepage/setup/start.sh <<'EOF'
#!/usr/bin/env bash
# why: dev (Turbopack) は初回コンパイルが重く、低スペック環境で固まりやすい。
#      build 済み成果物を next start で配信することで起動を一瞬にする。
source ~/.bashrc
cd ~/homepage/setup
npm run start
EOF
chmod +x ~/homepage/setup/start.sh
```

WSL を抜ける:

```bash
exit
```

---

## 8. 起動テスト (Windows)

PowerShell から:

```powershell
wsl -d Ubuntu -u ubuntu -- bash -i /home/ubuntu/homepage/setup/start.sh
```

ブラウザで `http://localhost:3001` を開き、setup0 画面が表示されることを確認したら `Ctrl+C` で停止。

---

## 9. WSL イメージのエクスポート (Windows)

```powershell
d:
cd d:\wsl_backup\
wsl --export Ubuntu homepage-v2-latest.tar
```

> **why:** `--export` は実行中のディストロを停止してから tar 化する。VHDX のスナップショットではないので、別マシンでも `wsl --import` で復元できる。

---

## 10. 圧縮 + ハッシュ算出 (WSL)

```bash
cd /mnt/d/wsl_backup
gzip -9 -k homepage-v2-latest.tar
sha256sum homepage-v2-latest.tar.gz > homepage-v2-latest.tar.gz.sha256
ls -l --si
```

> **why:** GitHub Release の単一アセットは 2 GB 上限。`gzip -9` で WSL イメージを圧縮し、ダウンロード後の改ざん検知のため sha256 を同梱する。

---

## 11. GitHub Release 作成 (Windows)

初回のみ `gh` CLI 導入と認証:

```powershell
winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements
gh auth login
```

リリース公開:

```powershell
cd d:\wsl_backup\
gh release create v2.0.0 `
   D:\wsl_backup\homepage-v2-latest.tar.gz `
   D:\wsl_backup\homepage-v2-latest.tar.gz.sha256 `
   --repo okamoto53515606/homepage `
   --title "v2.0.0" `
   --notes "homepage-v2 をリリースしました！"
```

---

## 受け取り側の起動手順（参考）

エンドユーザー向けの GUI インストーラを別リポジトリで提供している。`wsl --install` から `http://localhost:3001` 起動までを GUI でワンクリック実行できる。

- インストーラ: <https://github.com/okamoto53515606/homepage-v2-installer>

セットアップ画面が起動したら、`setup0` 画面で AWS キーを登録するところから本セットアップが始まる。詳細な操作手順はインストーラ側の README を参照。

---

## チェックリスト

イメージ出荷前に最低限確認:

- [ ] `wsl -d Ubuntu -u ubuntu -- bash -i /home/ubuntu/homepage/setup/start.sh` で `Ready in ...` が出る
- [ ] `http://localhost:3001/setup0` が表示される
- [ ] `docker info` が成功する（daemon 自動起動）
- [ ] `~/homepage/setup/.next` が存在し、`~/homepage/node_modules` も存在する

> 個人情報混入リスクは「`wsl --install` でクリーンな Ubuntu を作り、GitHub public リポジトリ以外からファイルを持ち込まない」運用で回避する。`.env` は `env_template.txt` のコピーで、AWS キー等は受け取り側が setup 画面から入力する設計。

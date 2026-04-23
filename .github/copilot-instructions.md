# Copilot Instructions

- 全体概要: docs/blueprint_v2.md
- 環境変数/セットアップ状態管理: docs/secrets-and-env_v2.md
- DB設計書: docs/database-schema_v2.md
- AWS最新情報: MCP（aws-knowledge-mcp-server / brave-search）

## 記述方針（必須）

- ソースコメントは「どう実装するか（How）」だけでなく「なぜそうするか（Why / 目的）」を先に明確に書く。
- CDKソースのコメントでは、構成理由・制約・運用上の意図（例: セキュリティ、循環依存回避、コスト）を明記する。
- gitコミットログは変更内容（How）だけでなく、背景と目的（Why）が第三者に伝わる件名/本文にする。

## このシステムの概要は以下の記事をご確認下さい。

[AIと創る広告ゼロ・都度課金型の個人メディア。「homepage」の全貌と、誰でも即オーナーになれる導入手順](https://www.okamomedia.tokyo/articles/aihomepage)

## 次期バージョン：homepage v2 について（検討中）

2027年3月のFirebase Studio終了を受け、インフラ基盤をFirebaseからAWSへ移行することを検討しています。

主な検討事項：
- AWS CDKによるセットアップの自動化（非エンジニアでも導入しやすくする）
- CloudFrontによるCDNキャッシュ対応（v1で断念した課題）
- Firestore → DynamoDB、GCS → S3 への移行

詳細は以下のドキュメントをご覧ください。

👉 [homepage v2 検討メモ](https://github.com/okamoto53515606/homepage/blob/main/docs/blueprint_v2.md)


/**
 * articlesコレクションのタグを管理するCLIスクリプト
 *
 * 使い方:
 * 1. タグの削除:
 *    npm run cli:manage-tags -- --delete="削除したいタグ名"
 *
 * 2. タグ名の変更（リネーム）:
 *    npm run cli:manage-tags -- --from="古いタグ名" --to="新しいタグ名"
 */
import { getAdminDb } from '../src/lib/firebase-admin';

// 引数をパースするためのヘルパー関数
// 例: --key=value 形式の引数を取得
const getArgumentValue = (argName: string): string | undefined => {
  // process.argv は ['node', 'path/to/script.js', '--arg1=val1', ...] のようになる
  const arg = process.argv.find(a => a.startsWith(`${argName}=`));
  if (!arg) return undefined;
  // "key=value" から "value" を取り出す
  return arg.split('=')[1];
};

const main = async () => {
  console.log('🔥 タグ一括管理CLIを起動します...');

  // --- 1. コマンドライン引数を解析 ---
  const tagToDelete = getArgumentValue('--delete');
  const tagToRenameFrom = getArgumentValue('--from');
  const tagToRenameTo = getArgumentValue('--to');

  const isDeleteMode = !!tagToDelete;
  const isRenameMode = !!tagToRenameFrom && !!tagToRenameTo;

  if (!isDeleteMode && !isRenameMode) {
    console.error(`
❌ エラー: 不正な引数です。以下のいずれかの形式で実行してください。

  【タグの削除】
  npm run cli:manage-tags -- --delete="エンジニアリング"

  【タグの変更】
  npm run cli:manage-tags -- --from="古いタグ" --to="新しいタグ"
    `);
    return;
  }

  if (isRenameMode && tagToRenameFrom === tagToRenameTo) {
      console.error('❌ エラー: --from と --to に同じタグ名が指定されています。');
      return;
  }

  try {
    // --- 2. Firebase Admin SDKからDBインスタンスを取得 ---
    // (初期化処理はgetAdminDb内で自動的に行われる)
    const db = getAdminDb();
    console.log('✅ Firebase Admin SDKの初期化完了');

    // --- 3. articlesコレクションの全ドキュメントを取得 ---
    const articlesRef = db.collection('articles');
    const snapshot = await articlesRef.get();

    if (snapshot.empty) {
      console.log('ℹ️ `articles`コレクションにドキュメントが見つかりませんでした。処理を終了します。');
      return;
    }

    console.log(`📄 ${snapshot.size}件の記事をチェックします...`);

    // --- 4. バッチ書き込みを準備 ---
    const batch = db.batch();
    let updatedCount = 0;

    // --- 5. 各ドキュメントをループ処理 ---
    snapshot.forEach(doc => {
      const tags = (doc.data().tags as string[] | undefined) || [];
      let newTags: string[] | null = null;

      // 【削除モード】
      if (isDeleteMode && tags.includes(tagToDelete!)) {
        console.log(`  - [削除] 記事ID: ${doc.id} からタグ「${tagToDelete}」を削除します。`);
        newTags = tags.filter(tag => tag !== tagToDelete);
      }
      // 【変更モード】
      else if (isRenameMode && tags.includes(tagToRenameFrom!)) {
        console.log(`  - [変更] 記事ID: ${doc.id} のタグ「${tagToRenameFrom}」を「${tagToRenameTo}」に変更します。`);
        // 古いタグをフィルタリングで削除し、新しいタグを追加
        const filteredTags = tags.filter(tag => tag !== tagToRenameFrom);
        filteredTags.push(tagToRenameTo!);
        // 重複を削除してセット
        newTags = [...new Set(filteredTags)];
      }

      // 更新が必要な場合、バッチに処理を追加
      if (newTags !== null) {
        batch.update(doc.ref, { tags: newTags });
        updatedCount++;
      }
    });

    if (updatedCount === 0) {
      if (isDeleteMode) {
        console.log(`✅ タグ「${tagToDelete}」を含む記事は見つかりませんでした。データベースは更新されていません。`);
      }
      if (isRenameMode) {
        console.log(`✅ タグ「${tagToRenameFrom}」を含む記事は見つかりませんでした。データベースは更新されていません。`);
      }
      return;
    }

    // --- 6. バッチ書き込みを実行 ---
    console.log(`\n🔄 ${updatedCount}件の記事のタグ情報を更新します...`);
    await batch.commit();
    console.log('✨ データベースの更新が正常に完了しました！');

  } catch (error) {
    console.error('❌ 処理中に致命的なエラーが発生しました:', error);
    process.exit(1); // エラーでプロセスを終了
  }
};

main();

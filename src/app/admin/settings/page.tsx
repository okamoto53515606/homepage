/**
 * サイト設定ページ（管理画面）
 * 
 * @description
 * サイト全体のグローバルな設定を管理します。
 * Firestoreの /settings/site_config ドキュメントを操作します。
 */

export default function SettingsPage() {
  // TODO: Firestore から /settings/site_config のデータを取得する
  // TODO: フォームを作成し、更新処理を実装する

  return (
    <>
      <header className="admin-page-header">
        <h1>サイト設定</h1>
        <p>サイト名、課金設定、法務関連ページなどを管理します。</p>
      </header>
      <div className="admin-card">
        <form>
          <div className="admin-form-group">
            <label htmlFor="siteName">サイト名</label>
            <input type="text" id="siteName" name="siteName" className="admin-input" defaultValue="homepage" />
            <small>サイトのヘッダーなどに表示されます。</small>
          </div>
          
          <div className="admin-form-group">
            <label htmlFor="paymentAmount">課金金額 (円)</label>
            <input type="number" id="paymentAmount" name="paymentAmount" className="admin-input" defaultValue="500" />
            <small>Stripeで決済される金額です。</small>
          </div>

          <div className="admin-form-group">
            <label htmlFor="accessDurationDays">アクセス有効日数 (日)</label>
            <input type="number" id="accessDurationDays" name="accessDurationDays" className="admin-input" defaultValue="30" />
            <small>一度の課金で有料記事を閲覧できる日数です。</small>
          </div>

          <hr style={{margin: '2rem 0'}}/>

          <div className="admin-form-group">
            <label htmlFor="metaTitle">トップページのmeta title</label>
            <input type="text" id="metaTitle" name="metaTitle" className="admin-input" defaultValue="homepage - 思慮深いコンテンツのための場所" />
          </div>

          <div className="admin-form-group">
            <label htmlFor="metaDescription">トップページのmeta description</label>
            <textarea id="metaDescription" name="metaDescription" className="admin-textarea" rows={2} defaultValue="広告モデルに疲れた人のためのミニマムなメディア"></textarea>
          </div>
          
          <hr style={{margin: '2rem 0'}}/>
          
          <div className="admin-form-group">
            <label htmlFor="legalCommerceContent">特定商取引法に基づく表記</label>
            <textarea id="legalCommerceContent" name="legalCommerceContent" className="admin-textarea" rows={10} placeholder="ここにMarkdown形式で入力..."></textarea>
          </div>
          
          <div className="admin-form-group">
            <label htmlFor="privacyPolicyContent">プライバシーポリシー</label>
            <textarea id="privacyPolicyContent" name="privacyPolicyContent" className="admin-textarea" rows={10} placeholder="ここにMarkdown形式で入力..."></textarea>
          </div>

          <div className="admin-form-group">
            <label htmlFor="termsOfServiceContent">利用規約</label>
            <textarea id="termsOfServiceContent" name="termsOfServiceContent" className="admin-textarea" rows={10} placeholder="ここにMarkdown形式で入力..."></textarea>
          </div>

          <button type="submit" className="admin-btn admin-btn--primary">設定を保存</button>
        </form>
      </div>
    </>
  );
}
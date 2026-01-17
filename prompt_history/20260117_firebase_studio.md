プログラム修正なしで、修正方法だけお願いします。管理画面から記事を追加するときと、記事を修正するときにAIが処理するので結構まちます。ボタン押した後にモーダルでAIが処理しているので1分ぐらいかかる旨を案内したいほしいです。（処理中は画面操作できないようにする）。

Gemini
承知いたしました。プログラムの修正は行わず、修正方法についてご説明します。

ご要望の「AI処理中にモーダルを表示して、操作できないようにする」機能は、既存の仕組みを活かすことで、比較的簡単に実現できます。

現在、記事の保存ボタンは、AIによる処理中（フォームを送信中）に useFormStatus という仕組みを使って「処理中...」という表示に切り替わっています。この「処理中」の状態を検知して、モーダルウィンドウを表示するように変更します。

具体的には、以下の2ステップで実装します。

処理中モーダルコンポーネントの新規作成 画面全体を覆い、中央にメッセージを表示する専用のコンポーネント ProcessingModal.tsx を作成します。
フォームへの組み込み 記事の作成・編集フォーム (article-form.tsx) で処理中状態を検知し、ProcessingModal.tsx を表示させます。
まず、ローディングメッセージを表示するためのモーダルコンポーネントを作成します。

ファイルパス: src/components/admin/processing-modal.tsx

内容: このコンポーネントは、画面全体を覆う半透明の背景と、その中央に表示されるメッセージボックスで構成されます。

// src/components/admin/processing-modal.tsx

import { Loader2 } from 'lucide-react';

export default function ProcessingModal() {
  return (
    // 画面全体を覆う背景（オーバーレイ）
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.6)', // 半透明の黒
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000, // 他の要素より手前に表示
    }}>
      {/* メッセージボックス */}
      <div style={{
        backgroundColor: 'white',
        color: '#333',
        padding: '2rem 3rem',
        borderRadius: '8px',
        textAlign: 'center',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Loader2 size={24} className="loading-spin" />
          <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>AIが記事を処理しています...</p>
        </div>
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
          これには1分程度かかる場合があります。<br />
          完了するまで、このままお待ちください。
        </p>
      </div>
    </div>
  );
}


次に、記事の作成・編集で共通して使われているフォームコンポーネントを修正し、処理中にこのモーダルを表示させます。

対象ファイル: src/app/admin/articles/article-form.tsx

修正方法: このファイルには、フォームの状態を監視するための useFormStatus フックを呼び出している部分があるはずです。その pending（処理中）の状態を使って、条件付きで ProcessingModal を表示します。

// src/app/admin/articles/article-form.tsx の修正イメージ

'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
// ステップ1で作成したコンポーネントをインポート
import ProcessingModal from '@/components/admin/processing-modal';
// (他のimport文)

// ...

/**
 * フォームの主要部分と送信ボタン
 * useFormStatusはフォームの子コンポーネントで呼び出す必要があるため、
 * このようにコンポーネントを分離するのが一般的です。
 */
function FormInner({ initialData }: { initialData?: any }) {
  // このフックでフォームの送信状態を監視
  const { pending } = useFormStatus();

  return (
    <>
      {/* pendingがtrueの時だけモーダルを表示 */}
      {pending && <ProcessingModal />}

      {/* --- ここから下は既存のフォーム要素 --- */}
      <div className="admin-card">
        {/* ... タイトルやコンテキスト入力欄など ... */}
      </div>
      
      <footer className="admin-form-footer">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
          {/* ボタンのテキストもpending状態で切り替え */}
          {pending ? 'AIが処理中...' : 'AIに執筆を依頼する'}
        </button>
      </footer>
      {/* --- ここまで既存のフォーム要素 --- */}
    </>
  );
}

// フォーム全体のコンポーネント
export default function ArticleForm({ article }: { article?: any }) {
  const [state, formAction] = useActionState(handleSaveArticle, { status: 'idle' });

  return (
    <form action={formAction}>
      <FormInner initialData={article} />
    </form>
  );
}


以上の修正により、記事の保存ボタンをクリックすると pending が true になり、画面全体に ProcessingModal が表示されます。AIの処理が完了すると pending が false になり、モーダルは自動的に消えます。

これにより、ユーザーは処理中であることを明確に認識でき、完了まで待機してくれるようになります。




Yoshiyuki
修正前に質問です。デグレードノリスクはどの程度かわかりますか？できるだけデグレを避けたいので確認してます。

Gemini
ご質問ありがとうございます。デグレードのリスクについて、ご心配されるのはもっともです。

結論から申し上げますと、今回の修正によるデグレードのリスクは「極めて低い」と考えています。

理由は以下の通りです。

修正範囲が「見た目」に限定されているため

今回の変更は、AIが処理を行っている間、その状態をユーザーに分かりやすく伝えるための「表示」を追加するだけのものです。
記事の内容を生成するAIのロジックや、それをデータベースに保存するといった裏側の処理（バックエンド）には一切手を加えません。
既存の仕組みをそのまま利用するため

フォームが「送信中」であることは、Reactの標準機能（useFormStatusフック）によってすでに検知されています。今回は、その「送信中」という状態を利用して、作成するモーダルを表示させるだけです。
新しい複雑なロジックを追加するわけではないため、予期せぬ副作用が発生する可能性は非常に低いです。
ご提示いただいた過去のログにあるデグレード（UIDが変わってしまった件）は、認証というシステムの根幹に関わる処理の変更が原因でした。これは、ユーザーの識別方法そのものを変えてしまったため、データ全体の整合性が失われるという深刻な影響がありました。

一方で、今回の修正は純粋なUI（ユーザーインターフェース）の改善です。万が一、この修正に問題があったとしても、その影響は「モーダルが正しく表示されない」といった表示上の不具合に限定され、記事データが失われたり、ユーザー情報がおかしくなったりするようなことはありません。

以上の理由から、安全に実施できる修正だと判断しておりますが、ご説明を聞かれて、まだご不安な点があれば遠慮なくお申し付けください。

これらの説明を踏まえた上で、修正作業を進めてもよろしいでしょうか？




Yoshiyuki
修正お願いします。修正後にテスト記事を追加し、修正をテストしますので。

Gemini
承知いたしました。デグレードのリスクが極めて低いことをご理解いただけたようで安心しました。 それでは、AI処理中にモーダルを表示する修正作業を開始します。完了後、テスト記事の追加で動作をご確認ください。

まず、ステップ1として、AI処理中に表示するモーダルコンポーネントを新たに作成します。

import { Loader2 } from 'lucide-react';

export default function ProcessingModal() {
  return (
    // 画面全体を覆う背景（オーバーレイ）
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.6)', // 半透明の黒
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000, // 他の要素より手前に表示
    }}>
      {/* メッセージボックス */}
      <div style={{
        backgroundColor: 'white',
        color: '#333',
        padding: '2rem 3rem',
        borderRadius: '8px',
        textAlign: 'center',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Loader2 size={24} className="loading-spin" />
          <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>AIが記事を処理しています...</p>
        </div>
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
          これには1分程度かかる場合があります。<br />
          完了するまで、このままお待ちください。
        </p>
      </div>
    </div>
  );
}
モーダルコンポーネント src/components/admin/processing-modal.tsx の作成が完了しました。

次に、ステップ2として、この記事作成・編集フォーム (src/app/admin/articles/article-form.tsx) を修正し、作成したモーダルを組み込みます。

まず、現在のファイル内容を読み込みます。

失礼いたしました。src/app/admin/articles/article-form.tsx というファイルは存在しないようです。私の先の回答に誤りがありました。申し訳ありません。

記事の作成ページと編集ページで共通のフォームコンポーネントが使われていると推測しましたが、実際には各ページファイルにフォームが直接実装されている可能性が高いです。

正しいファイルを見つけるために、まず src/app/admin/articles ディレクトリのファイル構成を確認します。

ファイル一覧を確認しました。私の推測が間違っていました。大変失礼いたしました。

新規作成は src/app/admin/articles/new/article-generator-form.tsx
編集は src/app/admin/articles/edit/[id]/article-edit-form.tsx
上記2つのファイルがそれぞれのフォームの実体であると判明しました。 お手数をおかけしますが、それぞれに同様の修正を加えていく形で進めさせていただければと思います。

まず、新規作成フォーム (src/app/admin/articles/new/article-generator-form.tsx) から修正します。 ファイルを読み込み、内容を確認します。

ファイルの内容を確認しました。ありがとうございます。 それでは、新規作成フォーム src/app/admin/articles/new/article-generator-form.tsx に、AI処理中のモーダル表示機能を追加します。

この修正は、既存の SubmitButton コンポーネント内にモーダルを追加するだけで完了するため、非常に安全です。

import { ref, uploadBytes } from 'firebase/storage';
import { useAuth } from '@/components/auth/auth-provider';
import imageCompression from 'browser-image-compression';
import ProcessingModal from '@/components/admin/processing-modal';
/**
 * 送信ボタンコンポーネント
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <>
      {pending && <ProcessingModal />}
      <button type="submit" disabled={pending} className="admin-btn admin-btn--primary">
        {pending ? (
          <>
            <Loader2 size={16} className="loading-spin" />
            <span>生成して下書き保存...</span>
          </>
        ) : (
          <>
            <Wand2 size={16} />
            <span>生成して下書き保存</span>
          </>
        )}
      </button>
    </>
  );
}
新規作成フォームの修正が完了しました。

次に、編集フォーム (src/app/admin/articles/edit/[id]/article-edit-form.tsx) にも同様の修正を行います。

ファイルを読み込み、内容を確認します。

ありがとうございます。編集フォーム (article-edit-form.tsx) の内容を確認しました。

しかし、一点確認させてください。このフォームは「公開ステータス（公開/下書き）」と「アクセスレベル（無料/有料）」を更新するためのもので、AIによる文章修正の処理は含まれていないようです。ボタンの表示も「公開ステータスを更新」となっています。

ファイル一覧を確認したところ、同じ階層に article-revision-form.tsx というファイルが存在しました。名前から推測するに、こちらがAIによる記事修正を行うフォームではないかと思われます。

お手数ですが、まず article-revision-form.tsx の中身を確認させていただけますでしょうか？ もしこちらがAI処理を行うフォームであれば、このファイルにモーダルを組み込むのが適切だと考えられます。

やはり、こちらの article-revision-form.tsx がAIによる記事修正フォームでしたね。ご確認いただきありがとうございます。

それでは、こちらにAI処理中モーダルを組み込みます。先ほどの新規作成フォームと同様の修正を行いますので、ご安心ください。

import { useEffect, useState, useRef } from 'react';
import { handleReviseArticle, type FormState } from './actions';
import { Loader2, Wand2 } from 'lucide-react';
import ProcessingModal from '@/components/admin/processing-modal';
interface ArticleRevisionFormProps {
  article: {
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <>
      {pending && <ProcessingModal />}
      <button type="submit" disabled={pending} className="admin-btn admin-btn--primary admin-btn--full">
        {pending ? (
          <>
            <Loader2 size={16} className="loading-spin" />
            <span>AIで修正中...</span>
          </>
        ) : (
          <>
            <Wand2 size={16} />
            <span>AIで修正を実行</span>
          </>
        )}
      </button>
    </>
  );
}
以上で、

記事の新規作成時 (article-generator-form.tsx)
記事のAI修正時 (article-revision-form.tsx)
の両方で、AIによる処理が実行されている間にモーダルウィンドウが表示されるようになりました。

src/components/admin/processing-modal.tsx を新規作成
AI処理中に表示するモーダルコンポーネントです。
src/app/admin/articles/new/article-generator-form.tsx を修正
記事の新規作成時に、上記モーダルを表示するようにしました。
src/app/admin/articles/edit/[id]/article-revision-form.tsx を修正
AIによる記事修正の実行時に、上記モーダルを表示するようにしました。
これで、ユーザーはAIの処理が実行中であることを明確に認識でき、誤って画面を閉じたり、他の操作をしたりすることを防げます。

それでは、お手数ですが、テスト記事の追加と修正をお試しいただき、モーダルが正しく表示されるかご確認をお願いいたします。

管理画面の「記事作成」ページと、既存記事の「編集」ページで、それぞれAIを動作させるボタンをクリックして挙動をご確認ください。





4 references used
Yoshiyuki
ありがとう。モーダルメッセージでうが、AIが処理しているという点も記載いただきたいです。

Gemini
ご指摘ありがとうございます。失礼いたしました。 モーダルのメインメッセージには「AIが記事を処理しています...」と記載しておりましたが、補足説明にもAIに関する言及があった方が、より丁寧で分かりやすいですね。

承知いたしました。src/components/admin/processing-modal.tsx を以下のように修正します。

変更前の補足説明:

これには1分程度かかる場合があります。
完了するまで、このままお待ちください。


変更後の補足説明:

AIによる処理には1分程度かかる場合があります。
完了するまで、このままお待ちください。


これにより、「何に」時間がかかるのかが、より明確になります。 それでは、ファイルを修正します。

          <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>AIが記事を処理しています...</p>
        </div>
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
          AIによる処理には1分程度かかる場合があります。<br />
          完了するまで、このままお待ちください。
        </p>
      </div>
モーダルのメッセージを修正しました。 補足説明に「AIによる処理には」という文言を追加しましたので、ご確認の上、テストをお願いいたします。

src/components/admin/processing-modal.tsx の現在のメッセージ:

AIが記事を処理しています...
AIによる処理には1分程度かかる場合があります。
完了するまで、このままお待ちください。


これで、より分かりやすくなったかと思います。 それでは、お手数ですが、管理画面からのテスト実行をお願いいたします。

Yoshiyuki
うまくいきました！ありがとう。現在右上の「publish」ボタンで本番(app hosting)にデプロイ中です。御礼まで。

Gemini
ご確認いただきありがとうございます！ 無事に動作したとのこと、そして本番環境へのデプロイまで進められたとのこと、大変うれしく思います。

実装した機能がユーザーの利便性向上に繋がることを願っております。

また何か開発でお困りのことや、お手伝いできることがありましたら、いつでもお気軽にお声がけください。 デプロイの完了を心よりお祈りしております！

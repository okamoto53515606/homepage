/**
 * 記事データモジュール
 * 
 * 記事データの取得・管理を行います。
 * 現在はハードコードされたダミーデータを使用。
 * 将来的にはFirestoreの記事コレクションに置き換え予定。
 * 
 * 【アクセス制御】
 * - access: 'free' → 全ユーザーが閲覧可能
 * - access: 'paid' → 有料会員または管理者のみ
 */

import { PlaceHolderImages } from './placeholder-images';

export interface Comment {
  id: string;
  authorId: string;
  location: string;
  text: string;
  timestamp: string;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  imageId: string;
  imageUrl?: string;
  imageHint?: string;
  access: 'free' | 'paid';
  comments: Comment[];
}

const articles: Article[] = [
  {
    id: '1',
    slug: 'the-future-of-content-creation',
    title: 'コンテンツ制作の未来',
    excerpt: 'AIと新しいプラットフォームがデジタルコンテンツの風景をどのように変えているかを探る。',
    content: `
# コンテンツ制作の未来

コンテンツ制作の世界は、地殻変動の真っ只中にあります。人工知能の進歩とプラットフォームの分散化に後押しされ、私たちが情報を生産、配布、消費する方法は急速に進化しています。

## AIアシスタントの台頭

生成AIツールはもはや目新しさではなく、クリエイターにとって不可欠な共同操縦士になりつつあります。記事の初期アウトラインの作成から、見事なビジュアルの生成まで、AIは人間の創造性を増強し、クリエイターがこれまで以上に高品質のコンテンツを迅速に制作できるようにします。

\`\`\`javascript
// AIサービスを利用する例
async function generateIdea(topic) {
  const response = await AIService.generate({
    prompt: \`\${topic}に関する記事のタイトルを5つブレインストーミングしてください\`
  });
  return response.ideas;
}
\`\`\`

## 再創造されるマネタイズ

サブスクリプション疲れは現実のものです。未来は、より柔軟な収益化モデルにあるかもしれません。都度課金、マイクロペイメント、トークンゲートアクセスなどが実行可能な代替案として浮上しており、消費者が支払う対象をより細かく制御できるようになります。これにより、独立したクリエイターは視聴者と直接的な関係を築くことができます。

## 重要なポイント

- **AIを受け入れる:** AIを代替品としてではなく、強力なアシスタントとして捉えましょう。
- **収益の多様化:** 従来の広告やサブスクリプション以外のモデルを探求しましょう。
- **コミュニティを構築する:** 視聴者との直接的なエンゲージメントは、これまで以上に価値があります。

この先の道はエキサイティングです。これらの新しいパラダイムに適応するクリエイターこそが、デジタルメディアの次の10年で成功するでしょう。
`,
    imageId: 'tech-innovation',
    access: 'paid',
    comments: [
      {
        id: 'c1',
        authorId: '#a1b2c3d4',
        location: '[US, California]',
        text: '素晴らしい洞察です！マイクロペイメントに関する点は特に興味深いです。Stripeや他のプラットフォームがどう適応していくのか気になります。',
        timestamp: '2時間前',
      },
      {
        id: 'c2',
        authorId: '#e5f6g7h8',
        location: '[DE, Berlin]',
        text: 'すでにブログ記事にAIアシスタントを使っていますが、生産性が劇的に向上しました。',
        timestamp: '1日前',
      },
    ],
  },
  {
    id: '2',
    slug: 'building-a-transparent-community',
    title: '透明性の高いオンラインコミュニティを構築する',
    excerpt: 'オンラインディスカッションで信頼と真正性を育むための戦略。',
    content: `
# 透明性の高いオンラインコミュニティを構築する

誤情報や匿名の荒らしが蔓延する時代において、健全で透明性のあるオンライン談話の場を作ることは大きな挑戦です。しかし、思慮深いデザイン選択を実装することで、信頼と真正性に基づいたコミュニティを育むことができます。

## 完全な匿名性の問題点

匿名性は脆弱な発言者を保護することができますが、しばしば悪意のある行為者を助長します。完全に匿名のコメント欄は、スパム、ヘイトスピーチ、操作によって頻繁に脱線します。重要なのは、バランスを見つけることです。ユーザーが現実世界の完全な身元を明かすことなく、ある程度の説明責任を提供する仮名のシステムです。

## 半透明性のモデル

一つのアプローチは、コメント投稿者に関する部分的で非識別的な情報を表示することです。これには以下が含まれます。

*   **出身国:** ユーザーの視点を文脈化するのに役立ちます。
*   **推定地域:** 特定しすぎることなく、別の文脈レイヤーを追加します。
*   **日替わりのハッシュID:** 24時間ごとに変わるユニークな識別子。これにより、ユーザーは1日のディスカッション内で認識されますが、長期的な追跡は防げます。

このシステムは、個人が同じ会話で複数の人物になりすますことを困難にし、穏やかな説明責任のレイヤーを追加します。

## モデレーションは依然として重要

透明性は万能薬ではありません。明確なコミュニティガイドラインと積極的なモデレーションと組み合わせる必要があります。目標は匿名性を排除することではなく、誠実な参加を促すフレームワークを構築することです。
`,
    imageId: 'global-community',
    access: 'free',
    comments: [
      {
        id: 'c3',
        authorId: '#i9j0k1l2',
        location: '[JP, Tokyo]',
        text: "これはオンラインコメントに対する非常に思慮深いアプローチですね。日替わりのハッシュIDは賢い解決策です。",
        timestamp: '5時間前',
      },
    ],
  },
  {
    id: '3',
    slug: 'the-art-of-the-side-hustle',
    title: 'サイドハッスルの技術',
    excerpt: 'あなたの情熱を成功し持続可能な副業に変える方法。',
    content: `
# サイドハッスルの技術

「サイドハッスル」は、流行語から多くの人にとって主流の経済的現実へと移行しました。情熱のためであれ利益のためであれ、副業を始めることは信じられないほどやりがいのある経験になり得ます。しかし、それをどうやって持続可能にするのでしょうか？

## 情熱から始め、データで検証する

最高のサイドハッスルは、しばしば個人的な興味や趣味から始まります。しかし、情熱だけでは市場は保証されません。大きな時間とお金を投資する前に、あなたのアイデアを検証しましょう。

1.  **問題を特定する:** あなたの情熱は他人のどんな問題を解決しますか？
2.  **ニッチを見つける:** あなたのターゲットオーディエンスは誰ですか？具体的にしましょう。
3.  **試してみる:** 簡単なランディングページを作成したり、ソーシャルメディアに投稿して興味を測ります。誰かあなたの解決策にお金を払ってくれますか？

## 時間管理がすべて

フルタイムの仕事とサイドハッスルを両立させることは、短距離走ではなくマラソンです。

*   **現実的な目標を設定する:** 一夜にして帝国を築こうとしないでください。
*   **時間を確保する:** 週に特定の時間をサイドハッスルに捧げ、それを守りましょう。
*   **自動化と委任:** 反復的なタスクを自動化するためにツールを使いましょう。成長するにつれて、あなたのコアスキルセットにないタスクを外部委託することを検討してください。

成功するサイドハッスルは、情熱、賢いビジネス戦略、そして規律ある実行の融合です。
`,
    imageId: 'financial-growth',
    access: 'free',
    comments: [],
  },
];

// Simulate API latency
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getArticles(): Promise<Article[]> {
  await delay(200);
  const articlesWithImages = articles.map(article => ({
    ...article,
    imageUrl: PlaceHolderImages.find(img => img.id === article.imageId)?.imageUrl || '',
    imageHint: PlaceHolderImages.find(img => img.id === article.imageId)?.imageHint || '',
  }));
  return articlesWithImages;
}

export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
  await delay(200);
  const article = articles.find(a => a.slug === slug);
  if (!article) return undefined;

  return {
    ...article,
    imageUrl: PlaceHolderImages.find(img => img.id === article.imageId)?.imageUrl || '',
    imageHint: PlaceHolderImages.find(img => img.id === article.imageId)?.imageHint || '',
  };
}

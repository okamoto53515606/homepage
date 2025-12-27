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
  access: 'free' | 'paid';
  comments: Comment[];
}

const articles: Article[] = [
  {
    id: '1',
    slug: 'the-future-of-content-creation',
    title: 'The Future of Content Creation',
    excerpt: 'Exploring how AI and new platforms are changing the landscape of digital content.',
    content: `
# The Future of Content Creation

The world of content creation is undergoing a seismic shift. Fueled by advancements in artificial intelligence and the decentralization of platforms, the way we produce, distribute, and consume information is rapidly evolving.

## The Rise of AI Co-pilots

Generative AI tools are no longer a novelty; they are becoming indispensable co-pilots for creators. From drafting initial article outlines to generating stunning visuals, AI can augment human creativity, allowing creators to produce higher quality content faster than ever before.

\`\`\`javascript
// Example of using an AI service
async function generateIdea(topic) {
  const response = await AIService.generate({
    prompt: \`Brainstorm 5 article titles about \${topic}\`
  });
  return response.ideas;
}
\`\`\`

## Monetization Reimagined

Subscription fatigue is real. The future may lie in more flexible monetization models. Pay-per-view, micropayments, and token-gated access are emerging as viable alternatives, giving consumers more control over what they pay for. This empowers independent creators to build direct relationships with their audience.

## Key Takeaways

- **Embrace AI:** Don't see it as a replacement, but as a powerful assistant.
- **Diversify Revenue:** Explore models beyond traditional ads and subscriptions.
- **Build Community:** Direct engagement with your audience is more valuable than ever.

The road ahead is exciting. Creators who adapt to these new paradigms will be the ones who thrive in the next decade of digital media.
`,
    imageId: 'tech-innovation',
    access: 'paid',
    comments: [
      {
        id: 'c1',
        authorId: '#a1b2c3d4',
        location: '[US, California]',
        text: 'Great insights! The point about micropayments is particularly interesting. I wonder how Stripe or other platforms will adapt.',
        timestamp: '2 hours ago',
      },
      {
        id: 'c2',
        authorId: '#e5f6g7h8',
        location: '[DE, Berlin]',
        text: "I'm already using an AI co-pilot for my blog posts, and it's been a game-changer for productivity.",
        timestamp: '1 day ago',
      },
    ],
  },
  {
    id: '2',
    slug: 'building-a-transparent-community',
    title: 'Building a Transparent Online Community',
    excerpt: 'Strategies for fostering trust and authenticity in online discussions.',
    content: `
# Building a Transparent Online Community

In an era of rampant misinformation and anonymous trolls, creating a space for healthy, transparent online discourse is a significant challenge. However, by implementing thoughtful design choices, we can foster communities built on trust and authenticity.

## The Problem with Full Anonymity

While anonymity can protect vulnerable speakers, it often enables bad actors. Completely anonymous comment sections are frequently derailed by spam, hate speech, and manipulation. The key is to find a balance—a system of pseudonyms that provides a degree of accountability without requiring users to reveal their full real-world identities.

## A Model for Semi-Transparency

One approach is to display partial, non-identifying information about commenters. This can include:

*   **Country of Origin:** Helps to contextualize a user's perspective.
*   **Estimated Region:** Adds another layer of context without being too specific.
*   **A Hashed Daily ID:** A unique identifier that changes every 24 hours. This allows users to be recognized within a single day's discussion but prevents long-term tracking.

This system makes it harder for individuals to pose as multiple people in the same conversation and adds a gentle layer of accountability.

## Moderation is Still Key

Transparency is not a silver bullet. It must be paired with clear community guidelines and active moderation. The goal is not to eliminate anonymity but to build a framework that encourages good-faith participation.
`,
    imageId: 'global-community',
    access: 'free',
    comments: [
      {
        id: 'c3',
        authorId: '#i9j0k1l2',
        location: '[JP, Tokyo]',
        text: "This is a really thoughtful approach to online comments. The daily hashed ID is a clever solution.",
        timestamp: '5 hours ago',
      },
    ],
  },
  {
    id: '3',
    slug: 'the-art-of-the-side-hustle',
    title: 'The Art of the Side Hustle',
    excerpt: 'How to turn your passion into a successful and sustainable side business.',
    content: `
# The Art of the Side Hustle

The "side hustle" has moved from a trendy buzzword to a mainstream economic reality for many. Whether for passion or profit, launching a side business can be an incredibly rewarding experience. But how do you ensure it's sustainable?

## Start with Passion, Validate with Data

The best side hustles often start from a personal interest or hobby. However, passion alone doesn't guarantee a market. Before you invest significant time and money, validate your idea.

1.  **Identify a Problem:** What problem does your passion solve for others?
2.  **Find Your Niche:** Who is your target audience? Be specific.
3.  **Test the Waters:** Create a simple landing page or post on social media to gauge interest. Is anyone willing to pay for your solution?

## Time Management is Everything

Juggling a full-time job and a side hustle is a marathon, not a sprint.

*   **Set Realistic Goals:** Don't try to build an empire overnight.
*   **Block Out Time:** Dedicate specific hours in your week to your side hustle and stick to them.
*   **Automate and Delegate:** Use tools to automate repetitive tasks. As you grow, consider outsourcing tasks that aren't in your core skillset.

A successful side hustle is a blend of passion, smart business strategy, and disciplined execution.
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

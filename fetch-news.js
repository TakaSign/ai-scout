// ============================================
// fetch-news.js
// NewsAPIからAIニュースを取得 → index.htmlに注入
// ============================================

const https = require('https');
const fs = require('fs');

const API_KEY = process.env.NEWS_API_KEY;

// ── カテゴリ別検索クエリ ──
const QUERIES = [
  { id: 'global',  q: 'AI artificial intelligence OpenAI Google Gemini Claude',  lang: 'en' },
  { id: 'japan',   q: 'AI 人工知能 生成AI 日本',                                   lang: 'ja' },
];

// ── NewsAPI fetch ──
function fetchNews(query, lang) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      q: query,
      language: lang,
      sortBy: 'publishedAt',
      pageSize: '5',
      apiKey: API_KEY,
    });

    const url = `https://newsapi.org/v2/everything?${params}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'ok') resolve(json.articles || []);
          else reject(new Error(json.message || 'API error'));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ── 記事を整形 ──
function formatArticle(article, index) {
  const colors   = ['#06b6d4', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b'];
  const badges   = ['🌐 GLOBAL', '🤖 AI NEWS', '💡 TECH', '⚠️ RESEARCH', '🇯🇵 JAPAN'];
  const color    = colors[index % colors.length];
  const badge    = badges[index % badges.length];

  const title    = (article.title || 'タイトル不明').replace(/'/g, '&#39;').replace(/"/g, '&quot;').slice(0, 60);
  const desc     = (article.description || article.content || '詳細はソースをご確認ください。')
                    .replace(/'/g, '&#39;').replace(/"/g, '&quot;').slice(0, 120);
  const source   = (article.source?.name || 'News Source').replace(/'/g, '&#39;');
  const url      = article.url || '#';
  const pubDate  = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
    : '最新';

  // カードID（ユニーク）
  const cardId = `news_${index}`;

  return { cardId, color, badge, title, desc, source, url, pubDate };
}

// ── カードHTML生成 ──
function buildCardHTML(a) {
  return `
  <div class="news-card" onclick="openModal('${a.cardId}')">
    <div class="card-accent" style="background:${a.color}"></div>
    <div class="card-head">
      <div class="card-meta">
        <div class="card-badge" style="background:rgba(255,255,255,.08);color:${a.color}">${a.badge}</div>
        <span class="card-date">${a.pubDate}</span>
      </div>
      <div class="card-title">${a.title}</div>
      <div class="card-preview">${a.desc}</div>
    </div>
    <div class="card-foot">
      <div class="tags"><span class="tag">#AIニュース</span><span class="tag">#${a.source}</span></div>
      <div class="tap-hint">詳細<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></div>
    </div>
  </div>`.trim();
}

// ── モーダルデータJS生成 ──
function buildNewsDataJS(articles) {
  const entries = articles.map(a => {
    const escaped_title = a.title.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escaped_desc  = a.desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `  ${a.cardId}: {
    color: '${a.color}',
    badge: '${a.badge}',
    date: '${a.pubDate}',
    title: '${escaped_title}',
    stats: [],
    highlight: '${escaped_desc}',
    body: '<p>${escaped_desc}</p>',
    source: '${a.source}',
    sourceUrl: '${a.url}',
    tags: ['#AIニュース'],
  }`;
  });
  return `const NEWS = {\n${entries.join(',\n')}\n};`;
}

// ── メイン処理 ──
async function main() {
  console.log('📡 NewsAPIからニュースを取得中...');

  let allArticles = [];

  for (const q of QUERIES) {
    try {
      const articles = await fetchNews(q.q, q.lang);
      console.log(`  ✅ ${q.id}: ${articles.length}件取得`);
      allArticles = allArticles.concat(articles.slice(0, 3));
    } catch (err) {
      console.warn(`  ⚠️ ${q.id} 取得失敗: ${err.message}`);
    }
  }

  // 重複除去・最大5件
  const unique = allArticles
    .filter((a, i, arr) => arr.findIndex(b => b.title === a.title) === i)
    .slice(0, 5);

  if (unique.length === 0) {
    console.log('❌ 記事が取得できませんでした。処理をスキップします。');
    process.exit(0);
  }

  const formatted = unique.map((a, i) => formatArticle(a, i));
  const cardsHTML = formatted.map(buildCardHTML).join('\n');
  const newsDataJS = buildNewsDataJS(formatted);

  // ── index.htmlを読み込んで注入 ──
  let html = fs.readFileSync('index.html', 'utf8');

  // 1. ニュースカードを差し替え
  html = html.replace(
    /<!-- NEWS_CARDS_START -->[\s\S]*?<!-- NEWS_CARDS_END -->/,
    `<!-- NEWS_CARDS_START -->\n${cardsHTML}\n<!-- NEWS_CARDS_END -->`
  );

  // 2. NEWSデータオブジェクトを差し替え
  html = html.replace(
    /\/\/ NEWS_DATA_START[\s\S]*?\/\/ NEWS_DATA_END/,
    `// NEWS_DATA_START\n${newsDataJS}\n// NEWS_DATA_END`
  );

  // 3. 最終更新日時を更新
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  html = html.replace(
    /<!-- LAST_UPDATED -->.*?<!-- \/LAST_UPDATED -->/,
    `<!-- LAST_UPDATED -->${now}<!-- /LAST_UPDATED -->`
  );

  fs.writeFileSync('index.html', html, 'utf8');
  console.log(`✅ index.html を更新しました（${unique.length}件）`);
  console.log(`📅 更新日時: ${now}`);
}

main().catch(err => {
  console.error('❌ エラー:', err);
  process.exit(1);
});

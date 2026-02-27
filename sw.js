// ============================================
// AI Scout — Service Worker
// キャッシュ管理 + バックグラウンド更新 + プッシュ通知
// ============================================

const CACHE_NAME = 'ai-scout-v1';
const CACHE_URLS = [
  './index.html',
  './manifest.json'
];

// ===== インストール =====
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS))
  );
  self.skipWaiting();
});

// ===== アクティベート（古いキャッシュ削除）=====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ===== フェッチ（キャッシュ優先 → ネット）=====
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // HTMLはキャッシュを更新
        if (event.request.url.includes('index.html')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ===== プッシュ通知受信 =====
self.addEventListener('push', event => {
  let data = { title: '🤖 AI Scout', body: '新しいAIニュースが届きました！', tag: 'ai-news' };

  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch (e) {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="%23070b14"/><text y="130" x="96" font-size="120" text-anchor="middle">🤖</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="%233b82f6"/><text y="68" x="48" font-size="60" text-anchor="middle">🤖</text></svg>',
      vibrate: [100, 50, 100],
      requireInteraction: false,
      data: { url: './' }
    })
  );
});

// ===== 通知タップでアプリを開く =====
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('./');
    })
  );
});

// ===== バックグラウンド同期 =====
self.addEventListener('sync', event => {
  if (event.tag === 'news-sync') {
    event.waitUntil(backgroundNewsSync());
  }
});

async function backgroundNewsSync() {
  // バックグラウンドで更新チェック（GitHub Actions側でPushを送る設計）
  console.log('[SW] バックグラウンドニュース同期実行');
}

// ===== 定期バックグラウンドフェッチ（対応ブラウザのみ）=====
self.addEventListener('periodicsync', event => {
  if (event.tag === 'daily-news-update') {
    event.waitUntil(backgroundNewsSync());
  }
});

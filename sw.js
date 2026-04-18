// ════════════════════════════════════════════════
// 音樂術科期末考系統 — Service Worker
// 版本：1.0  |  離線快取 + 背景同步
// ════════════════════════════════════════════════

const CACHE_NAME  = 'music-exam-v1';
const SYNC_TAG    = 'sync-jury-scores';

// 快取清單：所有需要離線運作的資源
const PRECACHE = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap',
];

// ── Install: 預先快取核心資源 ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: 清除舊版快取 ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Cache-first for assets, network-first for API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase API → network only（讓 Firebase SDK 自己處理離線）
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('gstatic.com')) {
    return; // 不攔截，讓 Firebase 自行管理
  }

  // Google Fonts → cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      }))
    );
    return;
  }

  // App shell → cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html')); // offline fallback
    })
  );
});

// ── Background Sync: 連線後自動上傳離線評分 ──
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingScores());
  }
});

async function syncPendingScores() {
  // 通知所有客戶端頁面執行同步（讓主頁面用已初始化的 Firebase SDK 操作）
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ type: 'SW_SYNC_REQUEST' }));
}

// ── Push: 接收推播通知（備用）──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || '音樂術科系統', {
      body: data.body || '',
      icon: '/icon.png',
    })
  );
});

// ── Message from main thread ──
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

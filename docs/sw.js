// 오프라인 지원: 처음 한 번 온라인으로 열면 이후에는 지하철 등 끊긴 구간에서도 열린다.
// 화면은 캐시에서 바로 띄우고, 온라인이면 뒤에서 새 버전을 받아 다음 실행 때 반영한다.
const CACHE = 'ipe-silgi-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(CORE.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function refresh(request, key) {
  return fetch(request).then(response => {
    if (response && (response.ok || response.type === 'opaque')) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(key || request, copy));
    }
    return response;
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 페이지: 캐시 먼저, 뒤에서 갱신
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(cached => {
        const network = refresh(request, './index.html').catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 같은 출처 파일과 Google Fonts: 캐시 먼저, 없으면 받아서 저장
  if (url.origin === self.location.origin || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || refresh(request).catch(() => cached))
    );
  }
});

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const P = (...p) => path.join(ROOT, ...p);
const LABEL = { c: 'C 언어', java: 'Java', python: 'Python', sql: 'SQL', design: '소프트웨어 설계', db: '데이터베이스', network: '네트워크', os: '운영체제', security: '정보 보안', test: '테스트', integration: '통합·패키징' };
const strip = s => String(s || '').replace(/^\[[^\]]+\]\s*/, '').replace(/\s*[\(（][^)）]*[\)）]\s*$/, '').replace(/\s*[-—]\s*$/, '').trim();
const uniq = arr => { const seen = new Set(); return arr.filter(a => { const k = String(a); if (seen.has(k)) return false; seen.add(k); return true; }); };

// 기존 34문항 (이전 세션에서 보정까지 끝난 상태)
const all = {};
for (const set of JSON.parse(fs.readFileSync(P('data', 'legacy-sets.json'), 'utf8'))) for (const q of set.questions) {
  const bucket = q.id.split('-')[0];
  all[q.id] = { ...q, bucket, bucketLabel: LABEL[bucket] };
}

// 새 38문항 + 검증자 보충 답안
const TAG = { '[통합]': 'integration', '[OS]': 'os', '[DB]': 'db', '[테스트]': 'test' };
for (const area of ['c', 'java', 'python', 'sql', 'security', 'network', 'design', 'misc']) {
  const qs = JSON.parse(fs.readFileSync(P('data', 'gen', `${area}.json`), 'utf8')).questions;
  const vfiles = ['c', 'java', 'python'].includes(area) ? [`${area}-A`, `${area}-B`] : [area];
  const vs = vfiles.map(f => JSON.parse(fs.readFileSync(P('data', 'verify', `${f}.json`), 'utf8')).results);
  qs.forEach((q, i) => {
    const rs = vs.map(v => v.find(r => r.index === i));
    if (!rs.every(r => r && r.verdict === 'pass')) throw new Error(`${area}-${i} not passed`);
    const parts = q.parts.map(p => ({ label: p.label, answers: [...p.answers] }));
    for (const r of rs) for (const e of (r.extraAnswers || [])) { const p = parts.find(x => x.label === e.label); if (p) p.answers.push(...e.answers.filter(Boolean)); }
    parts.forEach(p => { p.answers = uniq(p.answers); });
    let bucket = area;
    if (area === 'misc') { const tag = Object.keys(TAG).find(t => q.subtopic.startsWith(t)); bucket = TAG[tag]; }
    const id = `${area}-n${i}`;
    all[id] = { id, bucket, bucketLabel: LABEL[bucket], type: q.type, language: q.language || '', question: q.question, code: q.code || '', parts, explanation: q.explanation, difficulty: q.difficulty, point: strip(q.subtopic) };
  });
}

// 보정: 중재자 관계 표기 통일 (감수 의견)
for (const k of ['question', 'explanation']) all['design-1'][k] = all['design-1'][k].replace(/N:1/g, '1:N');

// 회차 구성 — 슬롯 순서: 보안 C 설계 Java 네트워크 Python DB C SQL 테스트 Java OS 설계 C 네트워크 Python 통합 Java 보안 SQL
const ROUNDS = [
  ['security-1', 'c-1', 'design-1', 'java-1', 'network-1', 'python-1', 'db-1', 'c-2', 'sql-1', 'test-3', 'java-2', 'os-1', 'design-2', 'c-n1', 'network-3', 'python-2', 'integration-1', 'java-3', 'security-3', 'sql-n3'],
  ['security-n0', 'c-4', 'design-n0', 'java-4', 'network-n1', 'python-3', 'db-2', 'c-n0', 'sql-n0', 'test-2', 'java-n3', 'os-2', 'design-n1', 'c-n5', 'network-2', 'python-n0', 'misc-n1', 'java-n4', 'security-n2', 'sql-n2'],
  ['security-n1', 'c-3', 'design-n2', 'java-n0', 'network-n0', 'python-n1', 'misc-n4', 'c-n3', 'sql-n1', 'test-1', 'java-n2', 'misc-n2', 'design-n3', 'c-n4', 'network-n2', 'python-n3', 'misc-n0', 'java-n5', 'security-2', 'sql-2'],
];
const used = new Set();
const SETS = ROUNDS.map((ids, r) => ({
  key: 'r' + (r + 1), name: `제${r + 1}회 모의고사`,
  questions: ids.map(id => {
    if (!all[id]) throw new Error('missing ' + id);
    if (used.has(id)) throw new Error('dup ' + id);
    used.add(id);
    const q = all[id];
    return { id: q.id, bucketLabel: q.bucketLabel, type: q.type, language: q.language, question: q.question, code: q.code, parts: q.parts, explanation: q.explanation, difficulty: q.difficulty, point: q.point };
  }),
}));
// 사용자가 제공한 HTML에서 추출한 회차. 기존 모의고사와 동일한 화면을 사용한다.
// data/explanations/<회차키>.json 이 있으면 해설·출제 포인트·영역을 덮어 쓴다(원본 imported-sets.json 은 그대로 둔다).
const EXPL_DIR = P('data', 'explanations');
for (const set of JSON.parse(fs.readFileSync(P('data', 'imported-sets.json'), 'utf8'))) {
  const f = path.join(EXPL_DIR, set.key + '.json');
  if (fs.existsSync(f)) {
    const ex = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const q of set.questions) {
      const e = ex[q.id];
      if (!e) continue;
      if (e.explanation) q.explanation = e.explanation;
      if (e.point) q.point = e.point;
      if (e.area) q.bucketLabel = e.area;
    }
  }
  SETS.push(set);
}
const spare = Object.keys(all).filter(id => !used.has(id));

// 개념정리 + 감수 보완 5건
const NOTES = JSON.parse(fs.readFileSync(P('data', 'notes.json'), 'utf8'));
const issues = JSON.parse(fs.readFileSync(P('data', 'verify', 'notes.json'), 'utf8')).issues;
if (issues.length !== 5) throw new Error('unexpected issue count');
const card = (ak, title) => NOTES.find(a => a.key === ak).cards.find(c => c.title === title);
let c;
c = card('design', '응집도(높을수록 좋음) · 결합도(낮을수록 좋음)'); c.rows.find(r => String(r[2]).startsWith('외부'))[3] = '다른 모듈에서 외부로 선언한 변수(반환값)를 참조';
c = card('design', 'GoF 디자인 패턴 23종'); c.rows.find(r => r[1].startsWith('중재자'))[2] = '객체 간 상호작용을 한 객체(중재자)에 캡슐화, M:N → 1:N';
c = card('security', '암호 알고리즘'); c.rows.find(r => r[1] === 'ARIA')[2] = '128비트 블록, 키 128/192/256, ISPN, 2004 국가정보원·산학연(Academy·Research Institute·Agency)';
c = card('lang', 'Java 객체지향 함정'); { const i = c.items.findIndex(x => x.startsWith('오버로딩은')); if (i < 0) throw new Error('overload item'); c.items[i] = '오버로딩은 매개변수 타입·개수로 컴파일 시점에 결정. int 인자는 int → long → float → double → (박싱) Integer → Object 순으로 가까운 것을 고른다.'; }
c = card('req', '자주 나온 용어'); c.rows.find(r => r[0] === '모듈화 지표')[1] = '팬인(자신을 호출하는 상위 모듈 수, 많으면 재사용 좋음), 팬아웃(자신이 호출하는 하위 모듈 수, 적을수록 좋음)';

const BS = String.fromCharCode(92), LSC = String.fromCharCode(0x2028), PSC = String.fromCharCode(0x2029);
const safe = o => JSON.stringify(o).split('</').join('<' + BS + '/').split(LSC).join(BS + 'u2028').split(PSC).join(BS + 'u2029');
const tpl = fs.readFileSync(P('src', 'app-template.html'), 'utf8');
for (const m of ['/*SETS*/[]/*END*/', '/*NOTES*/[]/*END*/', '/*PWA*/false/*PWA_END*/']) if (!tpl.includes(m)) throw new Error('marker ' + m);
const fill = pwa => tpl.split('/*SETS*/[]/*END*/').join(safe(SETS)).split('/*NOTES*/[]/*END*/').join(safe(NOTES)).split('/*PWA*/false/*PWA_END*/').join(pwa ? 'true' : 'false');
const app = fill(false);
fs.mkdirSync(P('dist'), { recursive: true });
fs.writeFileSync(P('dist', 'artifact.html'), app);

// GitHub Pages 용 index.html (완전한 문서)
const body = fill(true);
const cut = body.indexOf('<div class="app">');
const headPart = body.slice(0, cut), bodyPart = body.slice(cut);
const index = [
  '<!doctype html>',
  '<html lang="ko">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '<meta name="theme-color" content="#f8f8f5" media="(prefers-color-scheme: light)">',
  '<meta name="theme-color" content="#15181f" media="(prefers-color-scheme: dark)">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="정처기 실기">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="description" content="정보처리기사 실기 필답형 모의고사와 회차별 기출 풀이">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
  '<link rel="icon" type="image/png" href="icon-192.png">',
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}img{max-width:100%}</style>',
  headPart.trim(),
  '</head>',
  '<body>',
  bodyPart.trim(),
  '</body>',
  '</html>',
  '',
].join('\n');
fs.writeFileSync(P('docs', 'index.html'), index);
const imageSource = P('data', 'imported-images'), imageTarget = P('docs', 'imported-images');
fs.mkdirSync(imageTarget, { recursive: true });
const usedImages = new Set(SETS.flatMap(set => set.questions.flatMap(q => (q.images || []).map(src => path.basename(src)))));
for (const filename of fs.readdirSync(imageTarget)) if (!usedImages.has(filename)) fs.unlinkSync(path.join(imageTarget, filename));
for (const filename of usedImages) fs.copyFileSync(path.join(imageSource, filename), path.join(imageTarget, filename));
const workerPath = P('docs', 'sw.js');
const worker = fs.readFileSync(workerPath, 'utf8').replace(/^const IMAGE_ASSETS = .*;$/m, 'const IMAGE_ASSETS = ' + JSON.stringify([...usedImages].map(name => './imported-images/' + name)) + ';');
fs.writeFileSync(workerPath, worker);
fs.writeFileSync(P('dist', 'built-sets.json'), JSON.stringify(SETS, null, 1));

console.log('sets:', SETS.map(s => s.name + ' ' + s.questions.length).join(', '));
for (const s of SETS) {
  const d = {}, b = {};
  for (const q of s.questions) { d[q.difficulty] = (d[q.difficulty] || 0) + 1; b[q.bucketLabel] = (b[q.bucketLabel] || 0) + 1; }
  console.log(s.name, JSON.stringify(d), JSON.stringify(b));
}
console.log('spare (not used):', spare.join(', '));
console.log('app bytes', Buffer.byteLength(app), 'index bytes', Buffer.byteLength(index));

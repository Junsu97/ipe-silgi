// 헤드리스 Edge + CDP 로 모바일 화면 흐름 점검 (서버 없이 file:// 로 연다)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = 'file:///' + path.join(ROOT, 'docs', 'index.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, 'shots');
const PORT = 9347;
fs.mkdirSync(OUT, { recursive: true });
const profile = path.join(__dirname, 'profile');
fs.rmSync(profile, { recursive: true, force: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });

let ws, seq = 0;
const pending = new Map();
const logs = [];
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej, method }));
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + expr.slice(0, 120) + ' :: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}
async function shot(name, full) {
  let params = { format: 'png' };
  if (full) {
    const m = await send('Page.getLayoutMetrics');
    params = { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(m.cssContentSize.height, 4000), scale: 1 } };
  }
  const r = await send('Page.captureScreenshot', params);
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function device(w, h, dpr) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: true, screenWidth: w, screenHeight: h });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
async function overflow(label) {
  const o = await ev(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`);
  const ok = o.sw <= o.iw;
  results.push(`${ok ? 'OK ' : 'BAD'} 가로 넘침 없음 [${label}] scrollWidth=${o.sw} innerWidth=${o.iw}`);
}
const results = [];
const expect = (cond, msg) => results.push(`${cond ? 'OK ' : 'BAD'} ${msg}`);
const click = sel => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no element ' + ${JSON.stringify(sel)}); el.click(); return true; })()`);
const typeInto = (sel, value) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

(async () => {
  let ver;
  for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch (e) { await sleep(200); } }
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const pageT = list.find(t => t.type === 'page');
  ws = new WebSocket(pageT.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(p.method + ': ' + d.error.message)) : p.res(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + JSON.stringify(d.params.exceptionDetails).slice(0, 300));
    else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push('CONSOLE ' + d.params.type + ' ' + d.params.args.map(a => a.value || a.description).join(' '));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push('LOG ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

  // iPhone 14 Pro: 393 x 852 CSS px
  await device(393, 852, 2);
  await send('Page.navigate', { url: PAGE });
  await sleep(2500);

  // 1) 홈
  expect(await ev(`document.querySelectorAll('.set-card').length`) === await ev(`SETS.length`), '홈에 회차 카드 전부 표시');
  expect(await ev(`!document.getElementById('tabbar').hidden`), '홈에서 하단 탭바 표시');
  await overflow('홈 393'); await shot('01-home');

  // 2) 1회 시작
  await click('[data-act="start"][data-set="r1"]'); await sleep(300);
  expect(await ev(`location.hash`) === '#exam', '시작 → 시험 화면');
  expect(await ev(`document.getElementById('tabbar').hidden`), '시험 중 탭바 숨김');
  expect(await ev(`document.querySelector('[data-act="lock"]').disabled`), '빈 답일 때 「답 입력」 비활성');
  await overflow('시험 1번'); await shot('02-exam-q1');

  // 3) 1번: 정답 입력 → 답 입력 + 정답보기
  const a1 = await ev(`SETS[0].questions[0].parts[0].answers[0]`);
  await typeInto('.answers input', a1.toLowerCase()); await sleep(100);
  expect(!(await ev(`document.querySelector('[data-act="lock"]').disabled`)), '답을 쓰면 「답 입력」 활성');
  await click('[data-act="lock-reveal"]'); await sleep(200);
  expect(await ev(`document.querySelector('.q').dataset.state`) === 'correct', '1번 답 입력+정답보기 → 정답 표시 (' + a1 + ')');
  expect(await ev(`!!document.querySelector('.key')`), '1번 해설 노출');
  await shot('03-q1-lock-reveal');

  // 4) 2번(C 코드): 틀린 답 → 답 입력만 (정답 안 보임)
  await click('[data-act="next"]'); await sleep(200);
  await typeInto('.answers textarea', '1 2 3'); await click('[data-act="lock"]'); await sleep(150);
  expect(await ev(`!document.querySelector('.key')`), '2번 「답 입력」만 하면 정답·해설 숨김');
  expect(await ev(`document.querySelector('.answers textarea').readOnly`), '2번 잠긴 답은 읽기 전용');
  await overflow('C 코드 문항'); await shot('04-q2-locked');
  // 답 수정 → 다시 잠금
  await click('[data-act="unlock"]'); await sleep(100);
  expect(!(await ev(`document.querySelector('.answers textarea').readOnly`)), '「답 수정」으로 다시 편집 가능');
  await click('[data-act="lock"]'); await sleep(100);

  // 5) 3번: 정답보기만 → 미응답
  await click('[data-act="next"]'); await sleep(200);
  await click('[data-act="reveal"]'); await sleep(150);
  expect(await ev(`document.querySelector('.q').dataset.state`) === 'shown', '3번 정답보기만 → 미응답 처리');
  expect(await ev(`document.querySelector('.answers input').readOnly`), '정답 본 문항은 답 입력 불가');
  await shot('05-q3-reveal-only');

  // 6) 번호판 시트
  await click('[data-act="grid"]'); await sleep(150);
  expect(await ev(`document.querySelectorAll('.sheet .cell').length`) === 20, '번호판 20칸');
  expect(await ev(`[...document.querySelectorAll('.sheet .cell')].slice(0,3).map(c=>c.dataset.state).join(',')`) === 'locked,locked,shown', '번호판 상태: 1·2번 입력, 3번 정답 확인');
  await shot('06-grid-sheet');
  await click('.sheet .cell[data-i="9"]'); await sleep(150);
  expect(await ev(`document.querySelector('.q-num').textContent`) === '10.', '번호판에서 10번 이동');

  // 7) 4~20번: 3번 제외, 절반은 정답, 나머지는 오답으로 입력
  const n = await ev(`SETS[0].questions.length`);
  let expectCorrect = 1; // 1번
  for (let i = 3; i < n; i++) {
    await ev(`(() => { ui.qi = ${i}; saveUi(); renderExam(); })()`);
    const q = await ev(`SETS[0].questions[${i}]`);
    const right = i % 2 === 0;
    const fields = await ev(`document.querySelectorAll('.answers input, .answers textarea').length`);
    for (let p = 0; p < fields; p++) {
      const v = right ? q.parts[p].answers[0] : 'zzz';
      await ev(`(() => { const el = document.querySelectorAll('.answers input, .answers textarea')[${p}]; el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    }
    await click('[data-act="lock"]');
    if (right) expectCorrect++;
  }
  await ev(`(() => { ui.qi = 19; saveUi(); renderExam(); })()`); await sleep(100);
  expect(await ev(`document.querySelector('[data-act="next"]').disabled`), '마지막 문항에서 「다음」 비활성');

  // 8) 앱을 다시 열어도 진행 상태 유지
  await send('Page.reload'); await sleep(2000);
  expect(await ev(`location.hash`) === '#exam' && await ev(`document.querySelector('.q-num').textContent`) === '20.', '새로고침 후 같은 문항으로 복귀');
  expect(await ev(`Object.keys(getAttempt('r1').locked).length`) === 19, '새로고침 후 답 입력 19개 유지');

  // 9) 제출
  await click('[data-act="submit-ask"]'); await sleep(150);
  await shot('07-submit-sheet');
  await click('.sheet [data-act="submit"]'); await sleep(300);
  const score = await ev(`+document.querySelector('.score').firstChild.textContent`);
  expect(score === expectCorrect * 5, `제출 점수 ${score}점 = 정답 ${expectCorrect}개 × 5`);
  expect(await ev(`document.querySelector('.verdict').textContent`) === (score >= 60 ? '합격' : '불합격'), '합격/불합격 판정은 제출 후에만');
  await overflow('결과'); await shot('08-result', true);

  // 10) 결과 → 오답 해설
  await click('[data-act="key-wrong"]'); await sleep(300);
  const wrongItems = await ev(`document.querySelectorAll('.key-item').length`);
  expect(wrongItems === 20 - expectCorrect, `오답·미응답 해설 ${wrongItems}개`);
  await ev(`document.querySelector('.key-item').open = true`); await sleep(100);
  await overflow('해설집'); await shot('09-key-wrong');

  // 11) 결과 번호 → 해당 해설로 이동
  await send('Page.navigate', { url: PAGE + '#result' }); await sleep(1500);
  await click('[data-act="key-goto"][data-i="4"]'); await sleep(400);
  expect(await ev(`document.getElementById('k4') && document.getElementById('k4').open`), '결과의 5번 → 해설집 5번 펼침');

  // 12) 개념정리
  await click('[data-tab="notes"]'); await sleep(200);
  expect(await ev(`document.querySelectorAll('.chips button').length`) === 10, '개념정리 영역 10개');
  await overflow('개념정리 언어'); await shot('10-notes-lang');
  for (const k of ['sql', 'design', 'db', 'network', 'os', 'security', 'test', 'integration', 'req']) {
    await click(`[data-act="notes-area"][data-k="${k}"]`); await sleep(80);
    await overflow('개념정리 ' + k);
  }
  await click(`[data-act="notes-area"][data-k="design"]`); await sleep(100); await shot('11-notes-design');

  // 13) 홈 기록
  await click('[data-tab="home"]'); await sleep(200);
  expect(await ev(`document.querySelectorAll('.hist-row').length`) === 1, '홈 응시 기록 1건');
  await shot('12-home-after', true);

  // 14) 다크 모드 + 2회 코드 문항
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await click('[data-act="start"][data-set="r2"]'); await sleep(300);
  await ev(`(() => { ui.qi = 1; saveUi(); renderExam(); })()`); await sleep(150);
  await shot('13-dark-r2-code');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

  // 15) 갤럭시 Z 플립(펼침 412 x 915), 커버 화면 수준 좁은 폭(320)
  for (const [w, h, label] of [[412, 915, '플립 펼침'], [320, 700, '좁은 폭 320']]) {
    await device(w, h, 2);
    for (const v of ['home', 'exam', 'key', 'notes']) {
      await send('Page.navigate', { url: PAGE + '#' + v }); await sleep(900);
      await overflow(`${label} ${v}`);
    }
  }
  await device(320, 700, 2); await send('Page.navigate', { url: PAGE + '#exam' }); await sleep(900); await shot('14-w320-exam');

  // 16) 타이머: 시험 화면에서 흐르는지
  await device(393, 852, 2); await send('Page.navigate', { url: PAGE + '#exam' }); await sleep(2300);
  expect(/^\d\d:\d\d$/.test(await ev(`document.getElementById('timer').textContent`)) && await ev(`document.getElementById('timer').textContent`) !== '00:00', '시험 화면 경과 시간이 흐름');

  console.log(results.join('\n'));
  console.log('--- console/log errors ---');
  console.log(logs.length ? logs.join('\n') : '(없음)');
  ws.close(); edge.kill();
  process.exit(0);
})().catch(e => { console.error('TEST CRASH', e); console.log(results.join('\n')); console.log(logs.join('\n')); try { edge.kill(); } catch (_) {} process.exit(1); });

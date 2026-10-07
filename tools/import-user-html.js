// 사용자가 저장해 제공한 시험 HTML에서 문항, 정답, 문항 이미지만 추출한다.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SOURCES = [
  ['2020-1', '2a6d4468-3fcb-49c0-b95f-9410c829b03d'],
  ['2020-2', 'ab3590d8-7c24-41c5-97d8-ee44ca00a8ca'],
  ['2020-3', 'fa52c151-772d-476a-9fe1-22e0e7317075'],
  ['2020-4', '831ccd91-12a7-4f91-a14c-496b85a50753'],
  ['2021-1', 'addb9787-b5be-4a08-a9c5-0f8cd499d547'],
  ['2021-2', '001d2c8d-5da3-4529-a379-325a91d338ce'],
  ['2021-3', 'c111fbd2-64d0-480b-9b92-aa434ee981e3'],
  ['2022-1', 'bcfddd51-2ef2-4504-8c65-51672beb1361'],
  ['2022-2', 'ee07655f-275b-4c3a-8774-f367ffaeba98'],
  ['2022-3', 'f58b8aa9-85dc-4a2c-a193-12795b9a6743'],
  ['2023-1', '98d42c68-e0b7-4265-a17a-e3ebfcf90843'],
  ['2023-2', '3a6f5ae0-6481-4975-9415-2e9b4ad8fe27'],
  ['2023-3', '95c4c600-8df2-4cf9-96c2-0ce685443217'],
  ['2024-1', '41346c27-d69b-4e92-80e5-64580bf73663'],
  ['2024-2', '076a9064-a044-41c4-91b9-900dbaf82fa3'],
  ['2024-3', '00dccfb0-c878-4501-bbad-5fea47b36ef8'],
  ['2025-1', '02d9dabc-e13d-4643-aead-1aacd1ff42ac'],
  ['2025-2', '5111051b-4337-4b1b-a932-2aa1ccb460e0'],
];
const attachmentRoot = path.join(process.env.USERPROFILE, '.codex', 'attachments');
const imageDir = path.join(ROOT, 'data', 'imported-images');
fs.mkdirSync(imageDir, { recursive: true });
const decode = text => text.replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : +n))
  .replace(/&(?:nbsp|lt|gt|amp|quot|apos);/g, x => ({ '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" })[x]);
const clean = html => decode(html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean).join('\n');
const cleanPre = html => decode(html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\r/g, '').replace(/^\n+|\n+$/g, '');
const one = (html, pattern) => (html.match(pattern) || [])[1] || '';
const sets = [];
for (const [key, attachmentId] of SOURCES) {
  const html = fs.readFileSync(path.join(attachmentRoot, attachmentId, '붙여넣은 텍스트.txt'), 'utf8');
  const heading = clean(one(html, /(<h2 class="text-center">[\s\S]*?<\/h2>)/));
  const label = key.replace('-', '년 ') + '회';
  if (!heading.includes(label)) throw new Error(`${key}: wrong heading ${heading}`);
  const blocks = [...html.matchAll(/<div class="blog-post"[^>]*id="q(\d+)"[^>]*>/g)];
  const questions = blocks.map((m, i) => {
    const block = html.slice(m.index, blocks[i + 1]?.index ?? html.length);
    const subject = clean(one(block, /<h5 class="subject">([\s\S]*?)<\/h5>/));
    const no = +(one(subject, /^(\d+)/));
    const contents = cleanPre(one(block, /<pre class="contents">([\s\S]*?)<\/pre>/));
    const answer = clean(one(block, /<div class="shortAnswer[^>]*>([\s\S]*?)<\/div>/));
    if (!no || !subject || !answer) throw new Error(`${key}: incomplete question ${i + 1}`);
    const isCode = /(?:#include|\b(?:int|void)\s+main\s*\(|public\s+class|System\.out|printf\s*\(|>>>|\bdef\s+\w+\s*\(|\bSELECT\s+.+\bFROM\b)/i.test(contents);
    const question = subject.replace(/^\d+\.\s*/, '') + (contents && !isCode ? '\n\n' + contents : '');
    const beforeAnswer = block.slice(0, block.indexOf('class="shortAnswer'));
    const imageMatches = [...beforeAnswer.matchAll(/<img\b[^>]*\bsrc="data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)"/g)];
    const images = imageMatches.map((img, n) => {
      const ext = img[1] === 'jpeg' ? 'jpg' : img[1];
      const filename = `${key}-q${String(i + 1).padStart(2, '0')}-${n + 1}.${ext}`;
      fs.writeFileSync(path.join(imageDir, filename), Buffer.from(img[2], 'base64'));
      return `imported-images/${filename}`;
    });
    return { id: `past-${key}-${i + 1}`, sourceNumber: no, bucketLabel: '기출', type: answer.includes('\n') ? 'code' : 'short', language: '', question, code: isCode ? contents : '', images,
      parts: [{ label: '정답', answers: [answer] }], explanation: '제공된 자료의 답안입니다. 서술형·복수 정답은 답안과 직접 비교해 확인하세요.', difficulty: '', point: '' };
  });
  if (questions.length !== 20 && !(key === '2024-3' && questions.length === 18) && !(key === '2025-1' && questions.length === 40)) throw new Error(`${key}: ${questions.length} questions`);
  if (questions.some(q => !q.parts[0].answers[0])) throw new Error(`${key}: blank answer`);
  if (key === '2025-1') {
    for (let part = 0; part < 2; part++) sets.push({ key: `past-${key}-${part + 1}`, name: `${label} 기출 ${part ? 'B' : 'A'}`, questions: questions.slice(part * 20, part * 20 + 20) });
  } else sets.push({ key: `past-${key}`, name: `${label} 기출`, questions });
  console.log(label, questions.length, '문항', questions.reduce((n, q) => n + q.images.length, 0), '이미지');
}
fs.writeFileSync(path.join(ROOT, 'data', 'imported-sets.json'), JSON.stringify(sets, null, 2) + '\n');
const usedImages = new Set(sets.flatMap(set => set.questions.flatMap(q => q.images.map(src => path.basename(src)))));
for (const filename of fs.readdirSync(imageDir)) if (!usedImages.has(filename)) fs.unlinkSync(path.join(imageDir, filename));

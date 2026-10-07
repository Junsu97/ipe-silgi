# ipe-silgi

정보처리기사 실기 필답형 모의고사. 휴대폰에서 풀고 바로 채점하는 웹 앱이다.

- 자체 모의고사 3회분(60문항)과 제공받은 기출 자료 18회차(378문항), 해설집, 개념정리 10개 영역
- 문항마다 [답 입력] / [답 입력 + 정답보기] / [정답보기], 제출해야 점수·합격 여부 표시
- 답안·점수는 기기의 브라우저(localStorage)에만 저장
- 홈 화면에 추가하면 앱처럼 열리고, 한 번 열어 두면 오프라인에서도 동작

자체 모의고사 문항은 출제 기준(NCS 기반, 2020년 개정)과 기출 유형을 참고해 새로 작성했다. 기출 회차는 사용자가 제공한 HTML에서 문제·답안·문항 이미지를 추출했다. 2025년 1회 자료는 40문항이어서 A/B 두 묶음으로 표시하고, 2024년 3회 자료는 18문항만 들어 있다. 서술형·복수 정답의 자동 채점은 표현 차이로 부정확할 수 있으므로 표시된 답안과 직접 비교한다.

## 구조

| 경로 | 내용 |
|---|---|
| `docs/` | 배포본. GitHub Pages 가 이 폴더를 그대로 사이트로 연다 |
| `src/app-template.html` | 앱 화면·채점 로직 템플릿 |
| `data/notes.json` | 개념정리 원문 |
| `data/legacy-sets.json`, `data/gen/*.json` | 문항 원본 |
| `data/imported-sets.json`, `data/imported-images/` | 제공받은 기출 문항·답안·문항 이미지 |
| `data/verify/*.json` | 문항별 검증 결과와 추가 인정 답안 |
| `tools/build.js` | 문항 병합·회차 구성 → `docs/index.html` 생성 |
| `tools/import-user-html.js` | 제공받은 HTML을 기출 데이터로 변환한 일회성 스크립트 |
| `tools/uitest/test.js` | 헤드리스 Edge 로 모바일 화면 흐름 점검 |
| `tools/icon/Icon.java` | 홈 화면 아이콘 생성 |

## 수정 후 배포

```bash
node tools/build.js
git add -A && git commit -m "문항 수정" && git push
```

GitHub Pages 설정: Settings → Pages → Deploy from a branch → `main` / `/docs`.

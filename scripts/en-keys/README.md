# en-keys 기준 파일 / Reference Key Files

이 디렉토리에는 버전별 영어 원본 번역 키 목록이 저장됩니다.
번역률(coverage) 계산의 기준(분모)이 되므로, **반드시 OpenClaw 영어 원본 번들**에서 추출해야 합니다.

This directory contains the reference English key lists per OpenClaw version.
These files serve as the denominator for coverage calculations and **must be extracted from the official OpenClaw English bundle**.

## ⚠️ 현재 파일 상태 / Current File Status

| 파일 | 상태 | 비고 |
|------|------|------|
| `2026.3.13.txt` | ⚠️ 임시 베이스라인 | 커뮤니티 한국어 chunk에서 부트스트랩됨. 실제 영어 원본으로 교체 필요. |

## 올바른 재생성 방법 / How to Regenerate Correctly

1. OpenClaw `2026.3.13` 설치 디렉토리에서 영어 locale chunk 파일을 찾습니다.
   (`en-US-*.js` 또는 기본 번들의 en locale 청크)

2. `extract-keys.ts`로 추출합니다:
   ```bash
   npx ts-node scripts/extract-keys.ts /path/to/en-US.chunk.js --save 2026.3.13
   ```

3. 커뮤니티 chunk 파일(`*-community.js`)을 실수로 사용하지 마세요.
   `--force` 없이는 저장이 차단됩니다.

## 왜 중요한가 / Why This Matters

커뮤니티 chunk 파일을 베이스라인으로 사용하면:
- 번역되지 않아 파일에서 누락된 키가 분모에서도 빠지게 됩니다.
- 결과적으로 coverage가 실제보다 높게 계산됩니다 (최대 100%).
- `--update-meta`로 잘못된 값이 `locale-meta.json`에 기록될 수 있습니다.

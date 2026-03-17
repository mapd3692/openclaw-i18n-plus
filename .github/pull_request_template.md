## 변경 내용

<!-- 이 PR에서 변경한 내용을 간단히 설명해주세요 -->

## 번역 정보

- **언어**: <!-- 예: 한국어 (ko-KR) -->
- **OpenClaw 버전**: <!-- 예: 2026.3.13 -->
- **번역률**: <!-- 예: 98% -->

## 테스트 방법

1. OpenClaw에 플러그인 설치: `openclaw plugins install -l ./plugin`
2. `/lang <언어코드>` 명령어 실행
3. 브라우저 새로고침 후 설정에서 언어 변경 확인

## 체크리스트

- [ ] chunk 파일이 올바른 JS export 형식 (`var e={...};export{e as xx_XX};`)
- [ ] `locale-meta.json`에 언어 정보가 올바르게 등록됨
- [ ] aliases가 기존 언어와 중복되지 않음
- [ ] `CONTRIBUTING.md`의 파일명 규칙을 따름 (`{locale-code}-community.js`)
- [ ] 번역률이 `locale-meta.json`의 `coverage` 필드에 반영됨

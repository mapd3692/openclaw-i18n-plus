# OpenClaw i18n Plus

[![번역률 계산](https://github.com/mapd3692/openclaw-i18n-plus/actions/workflows/check-coverage.yml/badge.svg)](https://github.com/mapd3692/openclaw-i18n-plus/actions/workflows/check-coverage.yml)
[![로케일 검증](https://github.com/mapd3692/openclaw-i18n-plus/actions/workflows/validate-locale.yml/badge.svg)](https://github.com/mapd3692/openclaw-i18n-plus/actions/workflows/validate-locale.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

OpenClaw 커뮤니티 언어팩 프로젝트입니다.

OpenClaw의 공식 i18n 지원이 보류된 상황([#3460](https://github.com/openclaw/openclaw/issues/3460))에서, 커뮤니티 주도로 비공식 언어팩을 제공합니다. OpenClaw 플러그인으로 배포되어 `/lang ko` 한 줄로 언어팩을 설치할 수 있습니다.

## 지원 언어

### 공식 언어팩 (OpenClaw 내장)

de, es, pt-BR, zh-CN, zh-TW

### 커뮤니티 언어팩

| 언어 | 코드 | 상태 |
|------|------|------|
| 한국어 | ko-KR | 준비 중 |

## 설치

### 플러그인 설치 (한 번만)

```bash
openclaw plugins install @openclaw-community/i18n-plus
```

### 언어팩 설치

```bash
/lang ko
```

OpenClaw 업데이트 후에는 `/lang ko`를 다시 실행하면 됩니다.

## 사용법

### 사용 가능한 언어 목록 확인

```
/lang
```

### 커뮤니티 언어팩 설치

```
/lang <언어코드>
```

예시: `/lang ko`, `/lang korean`, `/lang 한국어`

### 공식 언어팩 안내

공식 언어팩(de, es, pt-BR, zh-CN, zh-TW)을 입력하면, Control UI 설정에서 직접 변경하도록 안내합니다.

## 동작 원리

이 플러그인은 OpenClaw의 Control UI 빌드 결과물에 locale chunk 파일을 추가하고, 메인 번들의 locale 매핑 테이블을 패치하는 방식으로 동작합니다. 핵심 로직은 수정하지 않으며, UI 리소스 파일만 패치합니다.

```
┌─────────────────────────────────────────────────────────────┐
│                      /lang ko 실행                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  1. GitHub에서 locale-meta.json 다운로드                     │
│     ┌──────────────────────────────┐                        │
│     │ locale-meta.json             │                        │
│     │   ko-KR:                     │                        │
│     │     aliases: [ko, korean...] │                        │
│     │     versions: {2026.3.13: …} │                        │
│     └──────────────────────────────┘                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  2. alias 정규화: "ko" → "ko-KR"                            │
│     공식 vs 커뮤니티 분기 → 커뮤니티                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. OpenClaw 버전 확인 → 매칭 chunk URL 결정                 │
│     GitHub raw에서 ko-KR-community.js 다운로드               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Control UI assets 디렉토리에 파일 배치 & 패치            │
│                                                             │
│  /app/dist/control-ui/assets/                               │
│  ├── index-{hash}.js  ← locale 매핑 테이블에 ko-KR 삽입     │
│  ├── ko-KR-community.js  ← 새로 추가                        │
│  ├── zh-CN-{hash}.js                                        │
│  └── ...                                                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  ✅ 설치 완료! 브라우저 새로고침 후 설정에서 한국어 선택      │
└─────────────────────────────────────────────────────────────┘
```

## 자동화

이 프로젝트는 GitHub Actions를 통해 다음을 자동화합니다:

- **번역률 계산** (`check-coverage.yml`): PR 시 번역률을 계산하여 코멘트로 달아줍니다. 80% 미만이면 경고를 표시합니다.
- **로케일 검증** (`validate-locale.yml`): locale-meta.json 스키마 검증, chunk 파일 문법 검증, alias 중복 검사를 수행합니다.

### 스크립트

| 스크립트 | 설명 |
|----------|------|
| `scripts/check-coverage.ts` | 번역률 자동 계산 (언어별, 버전별 테이블 출력) |
| `scripts/extract-keys.ts` | 영어 원본 키 추출 및 버전 간 diff 비교 |

## 개발자 설치

```bash
git clone https://github.com/mapd3692/openclaw-i18n-plus.git
cd openclaw-i18n-plus
openclaw plugins install -l ./plugin
```

## 기여하기

새로운 언어를 추가하거나 기존 번역을 개선하고 싶다면 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고해주세요.

이슈 템플릿을 활용하면 더 쉽게 기여할 수 있습니다:

- [새 언어 추가 요청](https://github.com/mapd3692/openclaw-i18n-plus/issues/new?template=new-locale.yml)
- [번역 개선 요청](https://github.com/mapd3692/openclaw-i18n-plus/issues/new?template=translation-update.yml)

## 기여자

이 프로젝트에 기여해주신 분들께 감사드립니다.

<a href="https://github.com/mapd3692/openclaw-i18n-plus/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=mapd3692/openclaw-i18n-plus" />
</a>

## 라이선스

[MIT](LICENSE)

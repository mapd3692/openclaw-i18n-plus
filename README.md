# OpenClaw i18n Plus

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

1. `locale-meta.json`에서 언어 정보를 확인
2. 해당 버전의 locale chunk 파일을 다운로드
3. Control UI assets 디렉토리에 chunk 파일 복사
4. 메인 번들(`index-*.js`)의 locale 매핑 테이블에 엔트리 삽입

## 개발자 설치

```bash
git clone https://github.com/mapd3692/openclaw-i18n-plus.git
cd openclaw-i18n-plus
openclaw plugins install -l ./plugin
```

## 기여하기

새로운 언어를 추가하거나 기존 번역을 개선하고 싶다면 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고해주세요.

## 라이선스

[MIT](LICENSE)

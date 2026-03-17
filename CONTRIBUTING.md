# 기여 가이드

OpenClaw i18n Plus에 기여해주셔서 감사합니다! 이 문서는 새로운 언어를 추가하거나 기존 번역을 개선하는 방법을 안내합니다.

## 새 언어 추가하기

### 1. locale chunk 파일 작성

기존 chunk 파일(예: `locales/` 디렉토리 내 파일)을 참고하여 새 언어의 chunk 파일을 작성합니다.

chunk 파일은 다음 포맷을 따릅니다:

```javascript
var e={common:{health:"건강 상태",...},nav:{...},...};export{e as ko_KR};
```

주의사항:
- export 이름은 locale 코드에서 `-`를 `_`로 변환한 값입니다 (예: `ko-KR` → `ko_KR`)
- OpenClaw의 기존 영어 키를 기준으로 번역합니다
- 번역하지 않은 키는 생략해도 됩니다 (영어 fallback이 자동 적용됨)

### 2. 파일 배치

`locales/{openclaw-version}/` 디렉토리에 파일을 추가합니다.

```
locales/
└── 2026.3.13/
    └── {locale-code}-community.js
```

파일명 규칙: `{locale-code}-community.js` (예: `ko-KR-community.js`, `ja-JP-community.js`)

### 3. locale-meta.json 업데이트

`locale-meta.json`에 언어 정보를 등록합니다:

```json
{
  "locales": {
    "ja-JP": {
      "name": "日本語",
      "aliases": ["ja", "jp", "japanese", "日本語"],
      "versions": {
        "2026.3.13": {
          "file": "locales/2026.3.13/ja-JP-community.js",
          "exportName": "ja_JP",
          "coverage": "95%"
        }
      }
    }
  }
}
```

필드 설명:
- `name`: 해당 언어의 원어 이름
- `aliases`: 사용자가 `/lang` 명령어에서 사용할 수 있는 별칭들
- `versions`: OpenClaw 버전별 chunk 파일 정보
  - `file`: chunk 파일 경로
  - `exportName`: chunk 파일의 export 이름 (`-` → `_` 변환)
  - `coverage`: 번역률 (전체 키 대비 번역된 키의 비율)

### 4. PR 제출

- 브랜치명: `locale/{locale-code}` (예: `locale/ja-JP`)
- PR 제목: `Add {언어이름} ({locale-code}) locale`
- PR 본문에 번역률과 참고한 자료를 명시해주세요

## 기존 번역 개선하기

1. 해당 locale chunk 파일을 수정합니다
2. 번역률이 변경된 경우 `locale-meta.json`도 업데이트합니다
3. PR을 제출합니다

## 새 OpenClaw 버전 대응

OpenClaw에 새 버전이 출시되면:

1. 새 버전에서 추가/변경된 번역 키를 확인합니다
2. `locales/{new-version}/` 디렉토리에 업데이트된 chunk 파일을 추가합니다
3. `locale-meta.json`의 `versions`에 새 버전 엔트리를 추가합니다

## 코드 스타일

- 커밋 메시지는 한국어 또는 영어로 작성합니다
- chunk 파일은 1줄 JS 포맷을 유지합니다 (minified)
- JSON 파일은 2칸 들여쓰기를 사용합니다

## 질문이 있다면

이슈를 생성하거나 디스커션에서 질문해주세요.

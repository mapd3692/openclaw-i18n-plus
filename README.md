# OpenClaw i18n Plus

커뮤니티 주도 OpenClaw 언어팩 — 명령어 한 줄로 설치합니다.

Community-driven language packs for OpenClaw, installable in a single command.

> OpenClaw 공식 i18n 지원이 보류된 동안([#3460](https://github.com/openclaw/openclaw/issues/3460)), 이 플러그인이 커뮤니티 언어팩을 코어 수정 없이 제공합니다.
>
> While OpenClaw's official i18n support is pending ([#3460](https://github.com/openclaw/openclaw/issues/3460)), this plugin bridges the gap by delivering community-maintained locale chunks without touching OpenClaw's core.

---

## 지원 언어 / Supported Languages

### 공식 언어팩 (OpenClaw 내장) / Official (built-in)

`de` `es` `pt-BR` `zh-CN` `zh-TW`

### 커뮤니티 언어팩 / Community Packs

| 언어 Language | 코드 Code | 상태 Status |
|--------------|-----------|-------------|
| 한국어 Korean | `ko` / `ko-KR` | ✅ 사용 가능 Available |

---

## 설치 / Installation

### 1. 플러그인 설치 (최초 1회) / Install the plugin (once)

```bash
openclaw plugins install @openclaw-community/i18n-plus
```

소스에서 설치 / Install from source:

```bash
git clone https://github.com/mapd3692/openclaw-i18n-plus.git
cd openclaw-i18n-plus
openclaw plugins install -l ./plugin
```

### 2. Gateway 재시작 / Restart the Gateway

플러그인 설치 후 **반드시 OpenClaw Gateway를 재시작**해야 `/lang` 명령어가 등록됩니다.

After installing the plugin, **restart the OpenClaw Gateway** before using `/lang`.

```bash
openclaw gateway restart
```

### 3. 언어팩 설치 / Install a language pack

```
/lang ko
```

OpenClaw 업데이트 후에는 플러그인이 자동으로 감지해 재패치합니다.

After an OpenClaw update, the plugin automatically detects the version change and re-patches.

---

## 사용법 / Usage

| 명령어 Command | 설명 Description |
|---------------|-----------------|
| `/lang` | 사용 가능한 언어 목록 보기 / List available community packs |
| `/lang <코드 code>` | 언어팩 설치 / Install a community language pack |

**예시 / Examples:**

```
/lang
/lang ko
/lang korean
```

공식 언어코드(예: `de`, `es`)를 입력하면, Control UI 설정에서 직접 변경하도록 안내합니다.

If you enter an official locale code (e.g. `de`, `es`), the plugin will guide you to the built-in language setting in Control UI instead.

---

## 동작 원리 / How It Works

OpenClaw Control UI 빌드 결과물만 패치합니다. 코어는 수정하지 않습니다:

This plugin patches OpenClaw's Control UI build artifacts directly — no core modifications:

1. `locale-meta.json`에서 언어 정보 확인 / Fetches language metadata from `locale-meta.json`
2. 현재 버전에 맞는 locale chunk 다운로드 / Downloads the matching locale chunk for your OpenClaw version
3. chunk 파일을 `/app/dist/control-ui/assets/`에 저장 / Copies the chunk to assets directory
4. 메인 번들의 locale 매핑 테이블에 엔트리 삽입 / Injects a locale entry into the main bundle

---

## 기여하기 / Contributing

새로운 언어를 추가하거나 번역을 개선하고 싶다면 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고해주세요.

Want to add a new language or improve an existing translation? See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 라이선스 / License

[MIT](LICENSE)

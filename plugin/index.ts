/**
 * OpenClaw i18n Plus — 커뮤니티 언어팩 플러그인
 *
 * /lang          — 사용 가능한 언어 목록 출력
 * /lang <code>   — 커뮤니티 언어팩 설치
 *
 * TODO: Phase 2에서 구현 예정
 */

// --- 상수 ---
const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/mapd3692/openclaw-i18n-plus/main";
const LOCALE_META_URL = `${GITHUB_RAW_BASE}/locale-meta.json`;

// --- 타입 ---
interface LocaleVersion {
  file: string;
  exportName: string;
  coverage: string;
}

interface LocaleEntry {
  name: string;
  aliases: string[];
  versions: Record<string, LocaleVersion>;
}

interface LocaleMeta {
  schemaVersion: number;
  officialLocales: string[];
  locales: Record<string, LocaleEntry>;
}

// --- 플러그인 엔트리포인트 ---
// TODO: OpenClaw 플러그인 API에 맞춰 구현
export default {
  name: "i18n-plus",

  commands: {
    lang: {
      description: "커뮤니티 언어팩 설치 및 관리",
      handler: async (args: string[]) => {
        // TODO: Phase 2에서 구현
        // 1. locale-meta.json 다운로드
        // 2. 인자 없으면 목록 출력
        // 3. 인자 있으면 alias 정규화 → 설치
      },
    },
  },
};

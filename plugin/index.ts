/**
 * OpenClaw i18n Plus — 커뮤니티 언어팩 플러그인
 *
 * /lang          — 사용 가능한 언어 목록 출력
 * /lang <code>   — 커뮤니티 언어팩 설치
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import https from "https";
import http from "http";

// --- 상수 ---
// 로컬 개발/테스트 시 환경변수로 오버라이드 가능
// 예: I18N_PLUS_BASE_URL=http://localhost:8080 openclaw plugins install -l ./plugin
const GITHUB_RAW_BASE =
  process.env.I18N_PLUS_BASE_URL ||
  "https://raw.githubusercontent.com/mapd3692/openclaw-i18n-plus/main";
const LOCALE_META_URL = `${GITHUB_RAW_BASE}/locale-meta.json`;

// Docker(/app/...) 및 네이티브 설치 모두 지원하기 위해 환경변수 또는 런타임
// stateDir에서 경로를 유도합니다. 하드코딩 경로는 최종 폴백으로만 사용됩니다.
const DEFAULT_CONTROL_UI_ASSETS = "/app/dist/control-ui/assets";
const DEFAULT_STATE_FILE = "/app/data/.i18n-plus-state.json";

// 런타임에서 주입되는 경로 — register() 호출 시 설정됨
let resolvedControlUiAssets: string = process.env.OPENCLAW_CONTROL_UI_ASSETS || DEFAULT_CONTROL_UI_ASSETS;
let resolvedStateFile: string = process.env.OPENCLAW_STATE_DIR
  ? join(process.env.OPENCLAW_STATE_DIR, ".i18n-plus-state.json")
  : DEFAULT_STATE_FILE;

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

// --- 유틸리티: HTTP(S) GET ---
// http:// 와 https:// 모두 지원하여 로컬 개발 환경(I18N_PLUS_BASE_URL=http://localhost:8080)에서도 동작
function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = (targetUrl: string) => {
      const parsedUrl = new URL(targetUrl);
      const transport = parsedUrl.protocol === "http:" ? http : https;
      transport
        .get(targetUrl, (res) => {
          // 리다이렉트 처리
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            request(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
            return;
          }
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => resolve(data));
          res.on("error", reject);
        })
        .on("error", reject);
    };
    request(url);
  });
}

// --- locale-meta.json 다운로드 ---
async function fetchLocaleMeta(): Promise<LocaleMeta> {
  const raw = await httpGet(LOCALE_META_URL);
  return JSON.parse(raw) as LocaleMeta;
}

// --- alias → 정식 locale 코드 정규화 ---
function resolveAlias(
  meta: LocaleMeta,
  input: string
): { code: string; entry: LocaleEntry } | null {
  const lower = input.toLowerCase();

  // 1. 정확한 locale 코드 매칭 (대소문자 무시)
  for (const [code, entry] of Object.entries(meta.locales)) {
    if (code.toLowerCase() === lower) {
      return { code, entry };
    }
  }

  // 2. alias 매칭
  for (const [code, entry] of Object.entries(meta.locales)) {
    if (entry.aliases.some((a) => a.toLowerCase() === lower)) {
      return { code, entry };
    }
  }

  return null;
}

// --- OpenClaw 버전 확인 ---
function getOpenClawVersion(): string {
  try {
    const output = execSync("openclaw --version", { encoding: "utf-8" }).trim();
    // "openclaw 2026.3.13" → "2026.3.13"
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : output;
  } catch {
    // fallback: package.json 등에서 추정
    try {
      const pkg = JSON.parse(
        readFileSync("/app/package.json", "utf-8")
      );
      return pkg.version || "unknown";
    } catch {
      return "unknown";
    }
  }
}

// --- 시맨틱 버전 비교 (a <= b) ---
function versionLte(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va < vb) return true;
    if (va > vb) return false;
  }
  return true; // equal
}

// --- 가장 적합한 chunk 버전 선택 ---
function selectBestVersion(
  versions: Record<string, LocaleVersion>,
  currentVersion: string
): { version: string; versionInfo: LocaleVersion; exact: boolean } | null {
  const versionKeys = Object.keys(versions).sort((a, b) =>
    versionLte(a, b) ? 1 : -1
  ); // 내림차순 정렬

  // 1. 정확 매칭
  if (versions[currentVersion]) {
    return {
      version: currentVersion,
      versionInfo: versions[currentVersion],
      exact: true,
    };
  }

  // 2. 가장 가까운 이전 버전 (현재 버전 이하 중 최신)
  for (const v of versionKeys) {
    if (versionLte(v, currentVersion)) {
      return { version: v, versionInfo: versions[v], exact: false };
    }
  }

  // 3. 대응 버전 없음 → 가장 최신 버전이라도 사용
  if (versionKeys.length > 0) {
    const latest = versionKeys[0];
    return { version: latest, versionInfo: versions[latest], exact: false };
  }

  return null;
}

// --- 메인 번들에 이미 패치되었는지 확인 ---
// expectedExportName을 전달하면 현재 번들에 패치된 exportName이 일치하는지도 검사합니다.
// locale-meta.json이 같은 코드의 exportName을 변경한 경우(예: 번들 재생성 후),
// 기존 패치가 이미 존재하더라도 재패치가 필요하므로 false를 반환합니다.
function isAlreadyPatched(indexJsPath: string, localeCode: string, expectedExportName?: string): boolean {
  const content = readFileSync(indexJsPath, "utf-8");
  if (!content.includes(`"${localeCode}":{exportName:`)) return false;
  // expectedExportName이 제공된 경우, 현재 번들의 exportName과 일치하는지 추가 검사
  if (expectedExportName !== undefined) {
    return content.includes(`"${localeCode}":{exportName:\`${expectedExportName}\``);
  }
  return true;
}

// --- 메인 번들 패치: locale 매핑 테이블에 엔트리 삽입 ---
// 반환값: true = 패치 성공, false = 앵커 미발견(패치 실패)
function patchMainBundle(
  indexJsPath: string,
  localeCode: string,
  exportName: string,
  chunkFileName: string
): boolean {
  const content = readFileSync(indexJsPath, "utf-8");

  // "zh-CN" 앵커를 기준으로 삽입
  const anchor = `"zh-CN":`;
  if (!content.includes(anchor)) {
    // 앵커가 없으면 번들 형식이 변경된 것 — 패치하지 않고 실패 반환
    return false;
  }

  const newEntry =
    `"${localeCode}":{exportName:\`${exportName}\`,` +
    `loader:()=>E(()=>import(\`./${chunkFileName}\`),[],import.meta.url)},`;

  const patched = content.replace(anchor, newEntry + anchor);
  writeFileSync(indexJsPath, patched, "utf-8");
  return true;
}

// --- 메인 번들 파일 탐색 ---
function findMainBundle(): string | null {
  try {
    const result = execSync(
      `find "${resolvedControlUiAssets}" -name "index-*.js" -not -name "*.map" | head -1`,
      { encoding: "utf-8" }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}

// --- 상태 파일 타입 ---
interface PluginState {
  installedLocales: Record<
    string,
    {
      patchedAt: string;           // ISO 타임스탬프
      openClawVersion: string;     // 패치 당시 OpenClaw 버전
      localePackVersion?: string;  // 설치한 locale-meta.json 버전 키 (exact 여부 판단에 사용)
    }
  >;
}

// --- 상태 읽기 ---
function readState(): PluginState {
  try {
    if (existsSync(resolvedStateFile)) {
      return JSON.parse(readFileSync(resolvedStateFile, "utf-8")) as PluginState;
    }
  } catch {
    // 파일이 손상된 경우 초기화
  }
  return { installedLocales: {} };
}

// --- 상태 쓰기 ---
function writeState(state: PluginState): void {
  try {
    writeFileSync(resolvedStateFile, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // /app/data 디렉토리가 없는 환경(테스트 등)에서는 무시
  }
}

// --- 자동 업데이트: 버전 변경 감지 시 설치된 언어팩 재패치 ---
async function autoUpdate(): Promise<void> {
  const state = readState();
  const installedCodes = Object.keys(state.installedLocales);

  if (installedCodes.length === 0) return;

  const currentVersion = getOpenClawVersion();
  if (currentVersion === "unknown") return;

  // locale-meta.json을 먼저 가져온 뒤 업데이트 필요 여부를 판단합니다.
  // openClawVersion 변경뿐 아니라, 동일 OpenClaw 버전에 더 나은 locale pack(exact 버전)이
  // 새로 추가된 경우(localePackVersion 변경)도 재패치 대상으로 포함합니다.
  let meta: LocaleMeta;
  try {
    meta = await fetchLocaleMeta();
  } catch {
    // 네트워크 오류 — 자동 업데이트 생략
    return;
  }

  const outdated = installedCodes.filter((code) => {
    const installed = state.installedLocales[code];
    // OpenClaw 버전이 변경된 경우
    if (installed.openClawVersion !== currentVersion) return true;
    // localePackVersion이 기록되어 있고, 현재 사용 가능한 최선 버전이 다른 경우
    // (예: 이전 설치 당시 exact 버전이 없어 fallback을 썼지만, 이후 exact 버전이 추가됨)
    if (installed.localePackVersion !== undefined) {
      const entry = meta.locales[code];
      if (entry) {
        const best = selectBestVersion(entry.versions, currentVersion);
        if (best && best.version !== installed.localePackVersion) return true;
      }
    }
    return false;
  });

  if (outdated.length === 0) return;

  console.log(
    `[i18n-plus] OpenClaw ${currentVersion} 감지 — ` +
      `${outdated.join(", ")} 언어팩 자동 업데이트 중...`
  );

  try {

    for (const code of outdated) {
      const entry = meta.locales[code];
      if (!entry) continue;

      const best = selectBestVersion(entry.versions, currentVersion);
      if (!best) continue;

      const { versionInfo } = best;
      const chunkUrl = `${GITHUB_RAW_BASE}/${versionInfo.file}`;

      try {
        const chunkContent = await httpGet(chunkUrl);
        const chunkFileName = `${code}-community.js`;
        const chunkDest = `${resolvedControlUiAssets}/${chunkFileName}`;

        if (!existsSync(resolvedControlUiAssets)) continue;

        writeFileSync(chunkDest, chunkContent, "utf-8");

        const indexJs = findMainBundle();
        if (!indexJs) {
          console.warn(`[i18n-plus] ${entry.name} 메인 번들을 찾을 수 없어 자동 업데이트를 건너뜁니다.`);
          continue;
        }
        if (!isAlreadyPatched(indexJs, code, versionInfo.exportName)) {
          const ok = patchMainBundle(indexJs, code, versionInfo.exportName, chunkFileName);
          if (!ok) {
            console.warn(`[i18n-plus] ${entry.name} 패치 앵커 미발견 — 번들 형식 변경 가능성 있음.`);
            continue;
          }
        }

        // 번들 패치가 확인된 후에만 상태 업데이트
        state.installedLocales[code] = {
          patchedAt: new Date().toISOString(),
          openClawVersion: currentVersion,
          localePackVersion: best.version,
        };

        console.log(`[i18n-plus] ${entry.name} 자동 업데이트 완료.`);
      } catch {
        console.warn(`[i18n-plus] ${entry.name} 자동 업데이트 실패 — 수동으로 /lang ${code} 를 실행해주세요.`);
      }
    }

    writeState(state);
  } catch {
    // 네트워크 오류 등 — 자동 업데이트 실패해도 플러그인 로드는 계속
  }
}

// --- /lang (인자 없음): 사용 가능한 언어 목록 출력 ---
async function listLanguages(meta: LocaleMeta): Promise<string> {
  const officialList = meta.officialLocales.join(", ");

  const communityEntries = Object.entries(meta.locales)
    .map(([code, entry]) => {
      const shortAlias = entry.aliases[0] || code;
      return `  ${shortAlias} (${entry.name})`;
    })
    .join("\n");

  return [
    `📦 OpenClaw Community Language Pack (i18n-plus)`,
    ``,
    `공식 언어팩 (built-in):`,
    `  ${officialList}`,
    ``,
    `커뮤니티 언어팩 (설치 가능):`,
    communityEntries,
    ``,
    `사용법: /lang <언어코드>`,
    `예시: /lang ko`,
  ].join("\n");
}

// --- /lang <code>: 커뮤니티 언어팩 설치 ---
async function installLanguage(
  meta: LocaleMeta,
  input: string
): Promise<string> {
  // 1. 공식 locale인지 확인
  const inputLower = input.toLowerCase();
  if (
    meta.officialLocales.some((loc) => loc.toLowerCase() === inputLower)
  ) {
    return [
      `ℹ️ ${input}은(는) 공식 언어팩입니다.`,
      `   Control UI 설정(Language)에서 직접 변경할 수 있습니다.`,
    ].join("\n");
  }

  // 2. alias 정규화
  const resolved = resolveAlias(meta, input);
  if (!resolved) {
    return [
      `❌ "${input}"에 해당하는 언어팩을 찾을 수 없습니다.`,
      `   /lang 명령으로 사용 가능한 언어 목록을 확인하세요.`,
    ].join("\n");
  }

  const { code, entry } = resolved;

  // 3. OpenClaw 버전 확인
  const currentVersion = getOpenClawVersion();
  if (currentVersion === "unknown") {
    return `❌ OpenClaw 버전을 확인할 수 없습니다. OpenClaw 환경에서 실행해주세요.`;
  }

  // 4. 가장 적합한 버전의 chunk 선택
  const best = selectBestVersion(entry.versions, currentVersion);
  if (!best) {
    return [
      `❌ ${entry.name} (${code}) 언어팩에 사용 가능한 버전이 없습니다.`,
      `   기여를 원하시면: https://github.com/mapd3692/openclaw-i18n-plus`,
    ].join("\n");
  }

  const { version, versionInfo, exact } = best;

  // 5. 메인 번들 위치 확인 (네트워크 호출 전에 먼저 수행)
  // 이미 설치된 경우 네트워크 없이 상태만 복구할 수 있으므로 다운로드 전에 체크
  const indexJs = findMainBundle();
  if (!indexJs) {
    return [
      `❌ 메인 번들 파일(index-*.js)을 찾을 수 없습니다.`,
      `   OpenClaw 설치 경로를 확인하거나 환경변수를 설정해주세요.`,
    ].join("\n");
  }

  // 6. 이미 패치된 경우 — chunk 파일만 갱신하고 상태를 복구한 뒤 반환
  // 중복 설치 방지 — exportName도 함께 검사하여 exportName이 변경된 경우 재패치
  // (같은 locale 코드더라도 locale-meta.json에서 exportName이 변경되면 번들을 재패치해야 함)
  const chunkFileName = `${code}-community.js`;
  if (isAlreadyPatched(indexJs, code, versionInfo.exportName)) {
    // 번들은 이미 올바른 exportName으로 패치돼 있음.
    // 단, 같은 버전·exportName을 유지하면서 chunk 파일만 인플레이스 수정(오타 수정 등)된
    // 경우를 처리하기 위해 chunk는 항상 새로 다운로드합니다.
    // patchMainBundle()은 중복 실행하지 않습니다.
    const chunkUrl = `${GITHUB_RAW_BASE}/${versionInfo.file}`;
    try {
      const chunkContent = await httpGet(chunkUrl);
      if (existsSync(resolvedControlUiAssets)) {
        const chunkDest = join(resolvedControlUiAssets, chunkFileName);
        writeFileSync(chunkDest, chunkContent, "utf-8");
      }
    } catch {
      // 네트워크 오류 시 기존 chunk를 그대로 사용 — 상태만 복구
    }

    // 상태 파일이 없을 수 있음 (경로 마이그레이션 후 / 수동 삭제 등)
    // — 여기서도 상태를 저장해 다음 OpenClaw 업그레이드 때 autoUpdate()가 건너뛰지 않도록 보장
    const state = readState();
    state.installedLocales[code] = {
      patchedAt: new Date().toISOString(),
      openClawVersion: currentVersion,
      localePackVersion: version,
    };
    writeState(state);

    return exact
      ? [
          `✅ ${entry.name}가 업데이트되었습니다. (openclaw ${version} 대응, 번역률 ${versionInfo.coverage})`,
          `   브라우저를 새로고침한 뒤 설정에서 ${entry.name}를 선택하세요.`,
        ].join("\n")
      : [
          `✅ ${entry.name}가 업데이트되었습니다. (openclaw ${version} 기준)`,
          `   ⚠️ 일부 새 항목은 영어로 표시될 수 있습니다.`,
          `   브라우저를 새로고침한 뒤 설정에서 ${entry.name}를 선택하세요.`,
        ].join("\n");
  }

  // 7. chunk 파일 다운로드 (이미 설치된 경우엔 건너뜀)
  const chunkUrl = `${GITHUB_RAW_BASE}/${versionInfo.file}`;
  let chunkContent: string;
  try {
    chunkContent = await httpGet(chunkUrl);
  } catch (err) {
    return `❌ 언어팩 파일을 다운로드할 수 없습니다: ${chunkUrl}`;
  }

  // 8. assets 디렉토리에 저장
  const chunkDest = join(resolvedControlUiAssets, chunkFileName);

  if (!existsSync(resolvedControlUiAssets)) {
    return [
      `❌ Control UI assets 디렉토리를 찾을 수 없습니다: ${resolvedControlUiAssets}`,
      `   네이티브 설치 환경에서는 환경변수를 설정해주세요:`,
      `   OPENCLAW_CONTROL_UI_ASSETS=<OpenClaw Control UI assets 경로>`,
    ].join("\n");
  }

  writeFileSync(chunkDest, chunkContent, "utf-8");

  // 패치 실행
  const patchOk = patchMainBundle(indexJs, code, versionInfo.exportName, chunkFileName);
  if (!patchOk) {
    return [
      `❌ 메인 번들 패치 실패: "zh-CN" 앵커를 찾을 수 없습니다.`,
      `   OpenClaw 버전 업데이트로 번들 형식이 변경되었을 수 있습니다.`,
      `   https://github.com/mapd3692/openclaw-i18n-plus/issues 에 신고해주세요.`,
    ].join("\n");
  }

  // 8. 상태 저장 (자동 업데이트를 위해 설치 버전 기록)
  const state = readState();
  state.installedLocales[code] = {
    patchedAt: new Date().toISOString(),
    openClawVersion: currentVersion,
    localePackVersion: version,
  };
  writeState(state);

  // 9. 결과 메시지
  if (exact) {
    return [
      `✅ ${entry.name}가 설치되었습니다. (openclaw ${version} 대응, 번역률 ${versionInfo.coverage})`,
      `   브라우저를 새로고침한 뒤 설정에서 ${entry.name}를 선택하세요.`,
    ].join("\n");
  } else {
    return [
      `✅ ${entry.name}가 설치되었습니다. (openclaw ${version} 기준)`,
      `   ⚠️ 일부 새 항목은 영어로 표시될 수 있습니다.`,
      `   브라우저를 새로고침한 뒤 설정에서 ${entry.name}를 선택하세요.`,
    ].join("\n");
  }
}

// --- 플러그인 엔트리포인트 ---
// OpenClaw 플러그인 API: register(api) 함수를 통해 명령어/서비스 등록
//
// 타입 출처: openclaw@2026.3.13 dist/plugin-sdk/plugins/types.d.ts
//   - registerCommand: (command: OpenClawPluginCommandDefinition) => void
//   - registerService: (service: OpenClawPluginService) => void
export function register(api: {
  registerCommand: (descriptor: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    handler: (ctx: {
      args?: string;          // 공백 구분 인자 전체 문자열 (예: "ko-KR")
      commandBody: string;    // 명령어 본문 전체 (예: "/lang ko-KR")
      channel: string;        // 채널 식별자 (예: "telegram")
      isAuthorizedSender: boolean;
      senderId?: string;
    }) => Promise<{ text?: string }> | { text?: string };
  }) => void;
  registerService: (descriptor: {
    id: string;
    start: (ctx: { stateDir: string; logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }; [key: string]: unknown }) => void | Promise<void>;
    stop?: (ctx: unknown) => void | Promise<void>;
  }) => void;
}): void {
  // 자동 업데이트 서비스 등록 — 플러그인 시작 시 백그라운드로 실행
  api.registerService({
    id: "auto-update",
    start: (ctx) => {
      // stateDir은 상태 파일 경로에만 사용합니다.
      // stateDir의 부모 디렉토리(dirname)로 assets 경로를 추론하는 것은
      // stateDir이 ~/.openclaw 같은 사용자 홈 디렉토리 하위인 경우
      // dirname이 홈 디렉토리가 되어 잘못된 경로를 생성할 수 있으므로 금지합니다.
      // Control UI assets 경로는 환경변수 OPENCLAW_CONTROL_UI_ASSETS로 오버라이드하세요.
      if (ctx.stateDir) {
        resolvedStateFile = join(ctx.stateDir, ".i18n-plus-state.json");
      }
      autoUpdate().catch(() => {});
    },
    stop: (_ctx) => { /* 정리 불필요 */ },
  });

  // /lang 명령어 등록
  api.registerCommand({
    name: "lang",
    description: "커뮤니티 언어팩 설치 및 관리",
    acceptsArgs: true,
    handler: async (ctx) => {
      // ctx.args: "/lang ko-KR" 입력 시 "ko-KR" (명령어 이름 제거된 나머지)
      const input = ctx.args?.trim() ?? "";
      try {
        // 1. locale-meta.json 다운로드
        const meta = await fetchLocaleMeta();

        // 2. 인자 없으면 목록 출력
        if (!input) {
          return { text: await listLanguages(meta) };
        }

        // 3. 첫 번째 토큰만 언어 코드로 사용 (예: "ko-KR extra" → "ko-KR")
        const langCode = input.split(/\s+/)[0];
        return { text: await installLanguage(meta, langCode) };
      } catch (err) {
        return {
          text: `❌ 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
}

// OpenClaw 로더는 default export를 통해 플러그인을 인식합니다.
export default register;

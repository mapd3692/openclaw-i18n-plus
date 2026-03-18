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

// --- 상수 ---
const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/mapd3692/openclaw-i18n-plus/main";
const LOCALE_META_URL = `${GITHUB_RAW_BASE}/locale-meta.json`;
const CONTROL_UI_ASSETS = "/app/dist/control-ui/assets";
// 상태 파일은 OpenClaw 업그레이드 시 교체되는 assets 디렉토리 외부에 보관
const STATE_FILE = "/app/data/.i18n-plus-state.json";

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

// --- 유틸리티: HTTPS GET ---
function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = (targetUrl: string) => {
      https
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
  const raw = await httpsGet(LOCALE_META_URL);
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
function isAlreadyPatched(indexJsPath: string, localeCode: string): boolean {
  const content = readFileSync(indexJsPath, "utf-8");
  return content.includes(`"${localeCode}":{exportName:`);
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
      `find ${CONTROL_UI_ASSETS} -name "index-*.js" -not -name "*.map" | head -1`,
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
      patchedAt: string;       // ISO 타임스탬프
      openClawVersion: string; // 패치 당시 OpenClaw 버전
    }
  >;
}

// --- 상태 읽기 ---
function readState(): PluginState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as PluginState;
    }
  } catch {
    // 파일이 손상된 경우 초기화
  }
  return { installedLocales: {} };
}

// --- 상태 쓰기 ---
function writeState(state: PluginState): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
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

  // 버전이 변경된 locale만 필터링
  const outdated = installedCodes.filter(
    (code) => state.installedLocales[code].openClawVersion !== currentVersion
  );

  if (outdated.length === 0) return;

  console.log(
    `[i18n-plus] OpenClaw ${currentVersion} 감지 — ` +
      `${outdated.join(", ")} 언어팩 자동 업데이트 중...`
  );

  try {
    const meta = await fetchLocaleMeta();

    for (const code of outdated) {
      const entry = meta.locales[code];
      if (!entry) continue;

      const best = selectBestVersion(entry.versions, currentVersion);
      if (!best) continue;

      const { versionInfo } = best;
      const chunkUrl = `${GITHUB_RAW_BASE}/${versionInfo.file}`;

      try {
        const chunkContent = await httpsGet(chunkUrl);
        const chunkFileName = `${code}-community.js`;
        const chunkDest = `${CONTROL_UI_ASSETS}/${chunkFileName}`;

        if (!existsSync(CONTROL_UI_ASSETS)) continue;

        writeFileSync(chunkDest, chunkContent, "utf-8");

        const indexJs = findMainBundle();
        if (indexJs && !isAlreadyPatched(indexJs, code)) {
          const ok = patchMainBundle(indexJs, code, versionInfo.exportName, chunkFileName);
          if (!ok) {
            console.warn(`[i18n-plus] ${entry.name} 패치 앵커 미발견 — 번들 형식 변경 가능성 있음.`);
            continue;
          }
        }

        // 상태 업데이트
        state.installedLocales[code] = {
          patchedAt: new Date().toISOString(),
          openClawVersion: currentVersion,
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

  // 5. chunk 파일 다운로드
  const chunkUrl = `${GITHUB_RAW_BASE}/${versionInfo.file}`;
  let chunkContent: string;
  try {
    chunkContent = await httpsGet(chunkUrl);
  } catch (err) {
    return `❌ 언어팩 파일을 다운로드할 수 없습니다: ${chunkUrl}`;
  }

  // 6. assets 디렉토리에 저장
  const chunkFileName = `${code}-community.js`;
  const chunkDest = join(CONTROL_UI_ASSETS, chunkFileName);

  if (!existsSync(CONTROL_UI_ASSETS)) {
    return `❌ Control UI assets 디렉토리를 찾을 수 없습니다: ${CONTROL_UI_ASSETS}`;
  }

  writeFileSync(chunkDest, chunkContent, "utf-8");

  // 7. 메인 번들 패치
  const indexJs = findMainBundle();
  if (!indexJs) {
    return [
      `❌ 메인 번들 파일(index-*.js)을 찾을 수 없습니다.`,
      `   파일은 다운로드되었지만 자동 패치에 실패했습니다.`,
    ].join("\n");
  }

  // 중복 설치 방지
  if (isAlreadyPatched(indexJs, code)) {
    // 번들은 이미 패치돼 있지만 상태 파일이 없을 수 있음
    // (경로 마이그레이션 후 / 수동 삭제 등) — 여기서도 상태를 저장해
    // 다음 OpenClaw 업그레이드 때 autoUpdate()가 건너뛰지 않도록 보장
    const state = readState();
    state.installedLocales[code] = {
      patchedAt: new Date().toISOString(),
      openClawVersion: currentVersion,
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
export function register(api: {
  registerCommand: (descriptor: {
    name: string;
    description: string;
    handler: (args: string[]) => Promise<{ text: string }> | { text: string };
  }) => void;
  registerService: (descriptor: {
    id: string;
    start: () => void;
    stop?: () => void;
  }) => void;
}): void {
  // 자동 업데이트 서비스 등록 — 플러그인 시작 시 백그라운드로 실행
  api.registerService({
    id: "auto-update",
    start: () => {
      autoUpdate().catch(() => {});
    },
    stop: () => { /* 정리 불필요 */ },
  });

  // /lang 명령어 등록
  api.registerCommand({
    name: "lang",
    description: "커뮤니티 언어팩 설치 및 관리",
    handler: async (args: string[]) => {
      try {
        // 1. locale-meta.json 다운로드
        const meta = await fetchLocaleMeta();

        // 2. 인자 없으면 목록 출력
        if (!args || args.length === 0 || args[0] === "") {
          const list = await listLanguages(meta);
          return { text: list };
        }

        // 3. 인자 있으면 설치
        const result = await installLanguage(meta, args[0]);
        return { text: result };
      } catch (err) {
        return {
          text: `❌ 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
}

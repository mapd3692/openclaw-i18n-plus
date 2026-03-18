#!/usr/bin/env npx ts-node

/**
 * 번역률 자동 계산 스크립트
 *
 * 영어 원본 키(OpenClaw 소스의 en 번역 키)와 커뮤니티 chunk 파일의 키를 비교하여
 * 언어별, 버전별 번역률(%)을 계산합니다.
 *
 * 사용법:
 *   npx ts-node scripts/check-coverage.ts
 *   npx ts-node scripts/check-coverage.ts --update-meta   # locale-meta.json 자동 업데이트
 *
 * 출력:
 *   언어별, 버전별 번역률 테이블
 */

import * as fs from "fs";
import * as path from "path";

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

interface CoverageResult {
  locale: string;
  name: string;
  version: string;
  totalKeys: number;
  translatedKeys: number;
  coveragePercent: number;
}

// --- 유틸리티 ---

/**
 * JS chunk 파일에서 번역 키를 재귀적으로 추출합니다.
 * chunk 형식: var e={common:{health:`건강상태`,...},nav:{...},...};export{e as ko_KR};
 */
function extractKeysFromChunk(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");

  // var e={...} 부분에서 객체 리터럴 추출
  const match = content.match(/var\s+\w+\s*=\s*(\{[\s\S]*\})\s*;\s*export/);
  if (!match) {
    console.warn(`  경고: ${filePath} 파싱 실패 — chunk 형식이 아닙니다.`);
    return [];
  }

  // 키를 재귀적으로 추출 (중첩 객체 지원)
  const keys: string[] = [];
  extractNestedKeys(match[1], "", keys);
  return keys;
}

/**
 * 중첩 객체 리터럴에서 키를 재귀적으로 추출합니다.
 * 간단한 파서 — 백틱/따옴표 문자열 값을 가진 키를 탐색합니다.
 */
function extractNestedKeys(objStr: string, prefix: string, keys: string[]): void {
  // 키:값 쌍을 매칭하는 정규식
  // 키는 식별자 또는 따옴표 문자열, 값은 백틱/따옴표 문자열 또는 중첩 객체
  const keyValueRegex = /(\w+|"[^"]+"|'[^']+')\s*:\s*(?:`[^`]*`|"[^"]*"|'[^']*'|\{)/g;
  let match: RegExpExecArray | null;

  while ((match = keyValueRegex.exec(objStr)) !== null) {
    const rawKey = match[0];
    const key = match[1].replace(/['"]/g, "");
    const fullKey = prefix ? `${prefix}.${key}` : key;

    // 값이 중첩 객체인 경우
    if (rawKey.endsWith("{")) {
      // 중괄호 매칭으로 중첩 객체 범위 찾기
      let depth = 1;
      let i = match.index + rawKey.length;
      const start = i;
      while (i < objStr.length && depth > 0) {
        if (objStr[i] === "{") depth++;
        else if (objStr[i] === "}") depth--;
        i++;
      }
      const nestedObj = objStr.slice(start, i - 1);
      extractNestedKeys(nestedObj, fullKey, keys);
      // 중첩 객체 범위를 건너뛰도록 lastIndex 업데이트
      // 이렇게 하지 않으면 외부 regex가 같은 위치에서 재개해
      // 내부 키를 부모 레벨에서 다시 매칭하는 이중 카운팅 버그 발생
      keyValueRegex.lastIndex = i;
    } else {
      // 리프 키
      keys.push(fullKey);
    }
  }
}

/**
 * 기준 영어 키 목록을 가져옵니다.
 * scripts/en-keys/ 디렉토리에 버전별 키 목록이 있으면 사용하고,
 * 없으면 해당 버전의 첫 번째 커뮤니티 chunk에서 키를 추출합니다.
 */
function getReferenceKeys(version: string, meta: LocaleMeta): string[] {
  const rootDir = path.resolve(__dirname, "..");

  // 1. 영어 원본 키 파일이 있는지 확인
  const enKeysFile = path.join(rootDir, "scripts", "en-keys", `${version}.txt`);
  if (fs.existsSync(enKeysFile)) {
    return fs
      .readFileSync(enKeysFile, "utf-8")
      .split("\n")
      .filter((line) => line.trim().length > 0);
  }

  // 2. en-keys 파일이 없으면 에러로 처리 — 커뮤니티 chunk를 baseline으로 사용하면
  //    첫 번째 locale이 항상 100%가 되어 locale-meta.json의 coverage 값이 오염됩니다.
  console.error(
    `오류: scripts/en-keys/${version}.txt 파일이 없습니다.\n` +
    `  영어 원본 키 파일을 먼저 생성해야 번역률을 정확히 계산할 수 있습니다.\n` +
    `  생성 방법: npx ts-node scripts/extract-keys.ts <chunk-file> --save ${version}`
  );
  process.exit(1);
}

// --- 메인 ---
function main(): void {
  const rootDir = path.resolve(__dirname, "..");
  const metaPath = path.join(rootDir, "locale-meta.json");
  const updateMeta = process.argv.includes("--update-meta");

  if (!fs.existsSync(metaPath)) {
    console.error("오류: locale-meta.json을 찾을 수 없습니다.");
    process.exit(1);
  }

  const meta: LocaleMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  const results: CoverageResult[] = [];

  // 모든 버전 수집
  const allVersions = new Set<string>();
  for (const entry of Object.values(meta.locales)) {
    for (const version of Object.keys(entry.versions)) {
      allVersions.add(version);
    }
  }

  for (const version of Array.from(allVersions).sort()) {
    const referenceKeys = getReferenceKeys(version, meta);
    const totalKeys = referenceKeys.length;

    if (totalKeys === 0) {
      console.log(`\n버전 ${version}: 기준 키를 찾을 수 없습니다. 건너뜁니다.`);
      continue;
    }

    for (const [localeCode, entry] of Object.entries(meta.locales)) {
      const versionInfo = entry.versions[version];
      if (!versionInfo) continue;

      const chunkPath = path.join(rootDir, versionInfo.file);
      if (!fs.existsSync(chunkPath)) {
        console.warn(`  경고: ${chunkPath} 파일이 존재하지 않습니다.`);
        continue;
      }

      const translatedKeys = extractKeysFromChunk(chunkPath);
      // 참조 키 집합과의 교집합만 카운트 — stale/extra 키가 coverage를 부풀리지 않도록
      const referenceSet = new Set(referenceKeys);
      const matchedCount = translatedKeys.filter((k) => referenceSet.has(k)).length;
      const coveragePercent =
        totalKeys > 0 ? Math.round((matchedCount / totalKeys) * 100) : 0;

      results.push({
        locale: localeCode,
        name: entry.name,
        version,
        totalKeys,
        translatedKeys: matchedCount,
        coveragePercent,
      });

      // locale-meta.json 업데이트
      if (updateMeta) {
        meta.locales[localeCode].versions[version].coverage = `${coveragePercent}%`;
      }
    }
  }

  // 결과 테이블 출력
  console.log("\n=== 번역률 계산 결과 ===\n");

  if (results.length === 0) {
    console.log("번역 파일이 없습니다.");
    return;
  }

  // 테이블 헤더
  console.log(
    "| 언어 | 코드 | 버전 | 번역 키 | 전체 키 | 번역률 |"
  );
  console.log(
    "|------|------|------|---------|---------|--------|"
  );

  for (const r of results) {
    const warning = r.coveragePercent < 80 ? " ⚠️" : "";
    console.log(
      `| ${r.name} | ${r.locale} | ${r.version} | ${r.translatedKeys} | ${r.totalKeys} | ${r.coveragePercent}%${warning} |`
    );
  }

  // GitHub Actions용 출력 (GITHUB_OUTPUT)
  if (process.env.GITHUB_OUTPUT) {
    const summary = results
      .map(
        (r) => `${r.locale}(${r.version}): ${r.coveragePercent}%`
      )
      .join(", ");
    const hasWarning = results.some((r) => r.coveragePercent < 80);

    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `coverage_summary=${summary}\n`
    );
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `has_warning=${hasWarning}\n`
    );

    // PR 코멘트용 마크다운 테이블
    let markdown = "## 📊 번역률 계산 결과\n\n";
    markdown += "| 언어 | 코드 | 버전 | 번역 키 | 전체 키 | 번역률 |\n";
    markdown += "|------|------|------|---------|---------|--------|\n";
    for (const r of results) {
      const warning = r.coveragePercent < 80 ? " ⚠️" : "";
      markdown += `| ${r.name} | ${r.locale} | ${r.version} | ${r.translatedKeys} | ${r.totalKeys} | ${r.coveragePercent}%${warning} |\n`;
    }
    if (hasWarning) {
      markdown += "\n> ⚠️ 번역률이 80% 미만인 언어가 있습니다.\n";
    }

    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `coverage_markdown<<EOF\n${markdown}\nEOF\n`
    );
  }

  // locale-meta.json 업데이트
  if (updateMeta) {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
    console.log("\n✅ locale-meta.json의 coverage 필드가 업데이트되었습니다.");
  }
}

main();

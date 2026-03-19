#!/usr/bin/env npx ts-node

/**
 * OpenClaw 영어 원본 키 추출 스크립트
 *
 * OpenClaw의 locale chunk 파일(영어 또는 다른 언어)에서 번역 키 목록을 추출합니다.
 * 새 버전 대응 시 어떤 키가 추가/삭제되었는지 diff를 출력할 수 있습니다.
 *
 * 사용법:
 *   npx ts-node scripts/extract-keys.ts <chunk-file>
 *   npx ts-node scripts/extract-keys.ts <chunk-file> --save <version>
 *   npx ts-node scripts/extract-keys.ts --diff <version1> <version2>
 *
 * 예시:
 *   # chunk 파일에서 키 목록 출력
 *   npx ts-node scripts/extract-keys.ts locales/2026.3.13/ko-KR-community.js
 *
 *   # 키 목록을 en-keys/ 디렉토리에 저장
 *   npx ts-node scripts/extract-keys.ts locales/2026.3.13/ko-KR-community.js --save 2026.3.13
 *
 *   # 두 버전 간 키 차이 비교
 *   npx ts-node scripts/extract-keys.ts --diff 2026.3.8 2026.3.13
 */

import * as fs from "fs";
import * as path from "path";

// --- 키 추출 함수 (check-coverage.ts와 동일한 로직) ---

function extractKeysFromChunk(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");

  const match = content.match(/var\s+\w+\s*=\s*(\{[\s\S]*\})\s*;\s*export/);
  if (!match) {
    console.error(`오류: ${filePath} 파싱 실패 — chunk 형식이 아닙니다.`);
    process.exit(1);
  }

  const keys: string[] = [];
  extractNestedKeys(match[1], "", keys);
  return keys.sort();
}

function extractNestedKeys(objStr: string, prefix: string, keys: string[]): void {
  const keyValueRegex = /(\w+|"[^"]+"|'[^']+')\s*:\s*(?:`[^`]*`|"[^"]*"|'[^']*'|\{)/g;
  let match: RegExpExecArray | null;

  while ((match = keyValueRegex.exec(objStr)) !== null) {
    const rawKey = match[0];
    const key = match[1].replace(/['"]/g, "");
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (rawKey.endsWith("{")) {
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
      // check-coverage.ts와 동일: 중첩 범위를 건너뛰어 이중 카운팅 방지
      keyValueRegex.lastIndex = i;
    } else {
      keys.push(fullKey);
    }
  }
}

// --- 명령어 처리 ---

function printUsage(): void {
  console.log(`사용법:
  npx ts-node scripts/extract-keys.ts <chunk-file>
  npx ts-node scripts/extract-keys.ts <chunk-file> --save <version>
  npx ts-node scripts/extract-keys.ts --diff <version1> <version2>
`);
}

function loadKeysFile(version: string): string[] {
  const keysDir = path.join(__dirname, "en-keys");
  const filePath = path.join(keysDir, `${version}.txt`);

  if (!fs.existsSync(filePath)) {
    console.error(`오류: ${filePath} 파일이 존재하지 않습니다.`);
    console.error(`먼저 --save 옵션으로 키 목록을 저장하세요.`);
    process.exit(1);
  }

  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .sort();
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  // diff 모드
  if (args[0] === "--diff") {
    if (args.length < 3) {
      console.error("오류: --diff에는 두 개의 버전이 필요합니다.");
      printUsage();
      process.exit(1);
    }

    const version1 = args[1];
    const version2 = args[2];

    const keys1 = new Set(loadKeysFile(version1));
    const keys2 = new Set(loadKeysFile(version2));

    const added = [...keys2].filter((k) => !keys1.has(k));
    const removed = [...keys1].filter((k) => !keys2.has(k));

    console.log(`\n=== 키 변경사항: ${version1} → ${version2} ===\n`);

    if (added.length > 0) {
      console.log(`추가된 키 (${added.length}개):`);
      for (const key of added) {
        console.log(`  + ${key}`);
      }
    }

    if (removed.length > 0) {
      console.log(`\n삭제된 키 (${removed.length}개):`);
      for (const key of removed) {
        console.log(`  - ${key}`);
      }
    }

    if (added.length === 0 && removed.length === 0) {
      console.log("변경된 키가 없습니다.");
    }

    console.log(`\n요약: +${added.length} / -${removed.length}`);
    return;
  }

  // 키 추출 모드
  const chunkFile = args[0];
  if (!fs.existsSync(chunkFile)) {
    console.error(`오류: ${chunkFile} 파일이 존재하지 않습니다.`);
    process.exit(1);
  }

  const keys = extractKeysFromChunk(chunkFile);
  console.log(`\n=== 키 목록 (${keys.length}개) ===\n`);

  for (const key of keys) {
    console.log(key);
  }

  // --save 모드
  const saveIndex = args.indexOf("--save");
  if (saveIndex !== -1 && args[saveIndex + 1]) {
    // en-keys 베이스라인은 영어 원본 번들에서 추출해야 합니다.
    // *-community.js 파일(커뮤니티 번역)을 사용하면 번역 누락 키가
    // 베이스라인에서 빠져 coverage가 순환 참조로 부풀려집니다.
    const baseName = path.basename(chunkFile);
    const forceFlag = args.includes("--force");
    if (baseName.includes("-community") && !forceFlag) {
      console.error(
        `\n❌ 커뮤니티 번역 파일(${baseName})은 en-keys 베이스라인으로 사용할 수 없습니다.`
      );
      console.error(
        `   영어 원본 번들에서 추출한 키를 사용해주세요.`
      );
      console.error(
        `   강제로 저장하려면 --force 플래그를 추가하세요.`
      );
      process.exit(1);
    }

    const version = args[saveIndex + 1];
    const keysDir = path.join(__dirname, "en-keys");

    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }

    const outputPath = path.join(keysDir, `${version}.txt`);
    fs.writeFileSync(outputPath, keys.join("\n") + "\n");
    console.log(`\n✅ ${outputPath}에 키 목록이 저장되었습니다.`);
  }
}

main();

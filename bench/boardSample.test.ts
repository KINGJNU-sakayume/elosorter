// 보드 예시 출력(board/sample.json)을 지어낸 세션으로 만든다.
//   npm run board:sample   — 파일을 다시 쓴다 (BOARD_SAMPLE=write)
//   npm run bench          — 파일이 지금 코드의 출력과 같은지만 본다
// 규격 검사는 src/core/board/tiles.test.ts가 한다.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { buildBoardTiles } from '../src/core/board/tiles';
import { SAMPLE_NOW, sampleSession } from '../src/core/board/sampleState';

const FILE = fileURLToPath(new URL('../board/sample.json', import.meta.url));

it('board/sample.json matches buildBoardTiles(sampleSession(), SAMPLE_NOW)', () => {
  const text = JSON.stringify(buildBoardTiles(sampleSession(), SAMPLE_NOW), null, 2) + '\n';
  if (process.env.BOARD_SAMPLE === 'write') writeFileSync(FILE, text);
  expect(readFileSync(FILE, 'utf8')).toBe(text);
});

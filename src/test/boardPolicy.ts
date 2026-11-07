// board 저장소 js/config.js 의 imageOrigins·linkOrigins 와 같은 값(board 5c26d37, 2026-11-06). 바뀌면 같이 고친다.
import type { BoardPolicy } from './boardSchema';

export const BOARD_POLICY: BoardPolicy = {
  imageOrigins: [
    'https://kingjnu-sakayume.github.io',
    'https://image.aladin.co.kr',
    'https://upload.wikimedia.org',
    'https://i.scdn.co',
    'https://is1-ssl.mzstatic.com',
    'https://is2-ssl.mzstatic.com',
    'https://is3-ssl.mzstatic.com',
    'https://is4-ssl.mzstatic.com',
    'https://is5-ssl.mzstatic.com',
    'https://image.tmdb.org',
    'https://t1.daumcdn.net',
    'https://search1.kakaocdn.net',
  ],
  linkOrigins: ['https://kingjnu-sakayume.github.io'],
};

/** 랭킹 서버(Supabase)의 주소 */
const API = 'https://wlkgwhxcqxazchnyooml.supabase.co/rest/v1';
/** 브라우저에 넣어도 되는 공개 키. 테이블의 접근 규칙이 허용한 일(순위 보기, 기록 올리기)만 할 수 있다. 비밀 키는 절대 넣지 않는다 */
export const KEY = 'sb_publishable_YNu4yQlh8QdE4mz_tyJbPA_LX57EGVX';
/** 서버가 이 시간(ms) 안에 답하지 않으면 포기하고 이 기기의 기록으로 넘어간다 */
const TIMEOUT = 6000;

/**
 * 서버 랭킹을 쓸지 여부. 개발 서버에서는 시험 기록이 실제 랭킹에 섞이지 않도록 끄고, 주소에 ?online을 붙였을 때만 켠다.
 */
export const ONLINE = !(import.meta as { env?: { DEV?: boolean } }).env?.DEV || new URLSearchParams(location.search).has('online');

export interface RankRow {
  /** 이름 */
  n: string;
  /** 도착 소요 시간(ms) */
  t: number;
}

/**
 * 랭킹 서버를 호출한다. 응답이 늦거나 오류면 예외를 던진다.
 * @author heojeehaeng(claude)
 * @param {string} path 호출할 경로
 * @param {Object} body 보낼 내용. 없으면 조회로 호출한다
 * @return {Promise} 응답 내용
 */
async function call<T>(path: string, body?: unknown): Promise<T> {
  if (!ONLINE) throw new Error('offline');
  const stop = new AbortController();
  const timer = window.setTimeout(() => stop.abort(), TIMEOUT);
  try {
    const res = await fetch(API + path, {
      method: body ? 'POST' : 'GET',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: stop.signal,
    });
    if (!res.ok) throw new Error(`rank ${res.status}`);
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 완주 기록을 서버에 올리고 그 기록의 순위와 전체 기록 수를 받는다.
 * @author heojeehaeng(claude)
 * @param {string} nick 이름
 * @param {number} timeMs 도착 소요 시간(ms)
 * @param {number} falls 넘어진 횟수
 * @param {number} detections 발각된 횟수
 * @param {string} title 칭호
 * @return {Promise} 순위(rank)와 전체 기록 수(total)
 */
export async function submitOnline(nick: string, timeMs: number, falls: number, detections: number, title: string): Promise<{ rank: number; total: number }> {
  const rows = await call<{ rank: number; total: number }[]>('/rpc/submit_record', {
    p_nick: nick,
    p_time_ms: Math.round(timeMs),
    p_falls: falls,
    p_detections: detections,
    p_title: title,
  });
  return { rank: Number(rows[0].rank), total: Number(rows[0].total) };
}

/**
 * 서버에서 빠른 순으로 상위 100명의 기록을 받는다.
 * @author heojeehaeng(claude)
 * @param {boolean} todayOnly true면 오늘(이 기기의 자정 이후) 올라온 기록만 받는다
 * @return {Promise} 기록 목록
 */
export async function fetchRanking(todayOnly: boolean): Promise<RankRow[]> {
  let path = '/records?select=nick,time_ms&order=time_ms.asc,created_at.asc&limit=100';
  if (todayOnly) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    path += `&created_at=gte.${encodeURIComponent(start.toISOString())}`;
  }
  const rows = await call<{ nick: string; time_ms: number }[]>(path);
  return rows.map((r) => ({ n: r.nick, t: r.time_ms }));
}

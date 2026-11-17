/** 달릴 수 있는 길의 절반 폭(m) */
export const ROAD_HALF = 3.7;

export const SPEED_BASE = 20.8;
export const SPEED_MAX = 26;
export const SIDE_SPEED = 14;
/** 넘어지지 않고 이 시간(초)을 달리면 최고 속도가 된다 */
export const BOOST_AFTER = 10;

/** 부스터: 속도 배율과 지속 시간(초). 대기 시간과 사용량 제한이 없어 누를 때마다 바로 나간다 */
export const BOOST_MULT = 2.3;
/** 기어가기 중의 이동 속도 배율. 앞으로 기는 속도와 좌우 이동에 모두 적용한다 */
export const HIDE_RATE = 0.5;
export const BOOST_TIME = 0.3;
/** 슬라이드로 미끄러지는 동안의 속도 배율 */
export const SLIDE_MULT = 1.3;

/** 넘어지는 동작과 지뢰로 날아가는 동작의 빠르기 배율 */
export const FALL_RATE = 1.3;
export const FALL_LIGHT = 1.5 / FALL_RATE;
export const FALL_HEAVY = 2.5 / FALL_RATE;

/** 체크포인트 간격(m) */
const CP_GAP = 220;

export interface Stage {
  id: 'mine' | 'city' | 'dmz' | 'ss';
  name: string;
  from: number;
  to: number;
  road: number;
  ground: number;
  /** 지평선과 안개의 색 */
  sky: number;
  /** 하늘 꼭대기의 색 */
  skyTop: number;
  fogNear: number;
  fogFar: number;
  light: number;
}

export const STAGES: Stage[] = [
  { id: 'mine', name: '아오지 탄광', from: 0, to: 750, road: 0x5a4636, ground: 0x2b2018, sky: 0x0d0a08, skyTop: 0x050403, fogNear: 14, fogFar: 95, light: 0.75 },
  { id: 'city', name: '북한 시내', from: 750, to: 1950, road: 0x8f8f8f, ground: 0xa9a59c, sky: 0xd4d9df, skyTop: 0x7f99bd, fogNear: 50, fogFar: 200, light: 1.0 },
  { id: 'dmz', name: '국경과 DMZ', from: 1950, to: 3600, road: 0x7a6a44, ground: 0x4f7d3a, sky: 0xbfe4f5, skyTop: 0x3f8fe0, fogNear: 60, fogFar: 210, light: 1.0 },
  { id: 'ss', name: 'SS사단', from: 3600, to: 4500, road: 0x6b7280, ground: 0x3d4f45, sky: 0x4a5f8f, skyTop: 0x0b1433, fogNear: 40, fogFar: 160, light: 0.8 },
];

/** 코스 전체 길이(m) */
export const COURSE_LEN = STAGES[STAGES.length - 1].to;

/** 구간 시작점과 구간 안의 일정 간격마다 체크포인트를 둔다 */
export const CHECKPOINTS: number[] = STAGES.flatMap((s) => {
  const list = [s.from];
  for (let d = s.from + CP_GAP; d < s.to - CP_GAP / 2; d += CP_GAP) list.push(d);
  return list;
});

/**
 * 달린 거리에 해당하는 구간을 반환한다.
 * @author heojeehaeng(claude)
 * @param {number} d 출발점부터 달린 거리(m)
 * @return {Stage} 해당 구간 정보
 */
export function stageAt(d: number): Stage {
  return STAGES.find((s) => d < s.to) ?? STAGES[STAGES.length - 1];
}

/**
 * 구간 안의 비율 위치를 거리로 바꾼다.
 * @author heojeehaeng(claude)
 * @param {string} id 구간 id
 * @param {number} frac 구간 안의 위치(0~1)
 * @return {number} 출발점부터의 거리(m)
 */
export function stagePos(id: Stage['id'], frac: number): number {
  const s = STAGES.find((v) => v.id === id)!;
  return s.from + (s.to - s.from) * frac;
}

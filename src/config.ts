/** 대사와 도움말처럼 달리면서 빨리 읽어야 하는 글에 쓰는 글꼴. 웹 글꼴을 받지 못하면 기기의 기본 한글 글꼴로 넘어간다. style.css의 --font와 같아야 한다 */
export const FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
/** 제목, 구호, 표지판에 쓰는 선전화풍 글꼴(검은고딕). 굵기가 하나뿐이고 영문이 없어, 없는 글자는 FONT로 나온다. style.css의 --display와 같아야 한다 */
export const FONT_DISPLAY = `"Black Han Sans", ${FONT}`;
/** 도장과 표창장 제목처럼 붓으로 쓴 글에 쓰는 글꼴. style.css의 --brush와 같아야 한다 */
export const FONT_BRUSH = `"Yeon Sung", ${FONT}`;

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
/** 슬라이드 한 번의 지속 시간(초) */
export const SLIDE_TIME = 0.5;
/** 점프의 처음 속도(m/s)와 중력(m/s²). 한 번 뛰면 약 0.69초 동안 떠 있고 1.31m까지 오른다 */
export const JUMP_V = 7.6;
export const GRAVITY = 22;

/**
 * 감시자의 시야나 탐조등 빛에 이 시간(초) 넘게 계속 닿아 있어야 발각된다. 가장자리를 스치기만 한 것은 봐준다.
 * 길게 잡으면 빨리 지나갈수록 안 걸려서 부스터로 그냥 뚫고 지나갈 수 있게 된다. 0.05초(3프레임)면 속도와 상관없이 걸리는 비율이 거의 같다.
 */
export const DETECT_GRACE = 0.05;

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
  /** 구간의 메인 색. 화면 전체에 이 색을 얇게 씌워 구간마다 톤을 맞춘다 */
  tint: number;
  /** 메인 색을 씌우는 세기(0~1) */
  grade: number;
  /** 물체 가장자리에 그리는 외곽선의 색. 메인 색을 어둡게 내린 색이라 구간의 톤과 어울린다 */
  ink: number;
}

/** 붉은 시야, 조준선, 낙하 예고, 지뢰 깃발, 거인의 발자리에 함께 쓰는 경고색. 어느 구간에서나 같은 색으로 보이게 한다 */
export const WARN = 0xf0523a;

// 구간마다 메인 색(tint)에서 밝기와 채도만 바꿔 하늘, 안개, 땅, 길 색을 정했다. 안개를 가깝게 깔아 먼 곳이 뿌옇게 번지는 아련한 느낌을 낸다.
export const STAGES: Stage[] = [
  { id: 'mine', name: '아오지 탄광', from: 0, to: 750, road: 0x7a685d, ground: 0x54463e, sky: 0x3d322c, skyTop: 0x1c1715, fogNear: 12, fogFar: 92, light: 0.9, tint: 0x9a887e, grade: 0.22, ink: 0x2e2420 },
  { id: 'city', name: '북한 시내', from: 750, to: 1950, road: 0xa99cab, ground: 0xd0bfcd, sky: 0xf4e2f1, skyTop: 0xb4a2d8, fogNear: 34, fogFar: 175, light: 0.96, tint: 0xe6b4e5, grade: 0.16, ink: 0x4a3350 },
  // 새벽에 달리는 느낌을 내려고 안개를 가장 가깝게 깔고 빛을 조금 낮춘다.
  { id: 'dmz', name: '국경과 DMZ', from: 1950, to: 3600, road: 0x7e796b, ground: 0x5f7567, sky: 0xb0b7c6, skyTop: 0x4f5870, fogNear: 26, fogFar: 150, light: 0.92, tint: 0x6c7286, grade: 0.2, ink: 0x232838 },
  { id: 'ss', name: 'SS사단', from: 3600, to: 4500, road: 0x808b82, ground: 0x56664f, sky: 0xb9c6b6, skyTop: 0x2d3a36, fogNear: 30, fogFar: 150, light: 0.88, tint: 0x8b9f8c, grade: 0.2, ink: 0x1f2b24 },
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

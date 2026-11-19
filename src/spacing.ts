import { GRAVITY, JUMP_V, SIDE_SPEED, SLIDE_MULT, SPEED_BASE, SPEED_MAX } from './config';

/**
 * 장애물이 리용길에게 요구하는 동작.
 * - jump: 정해진 자리에서 점프한다 (길을 다 막은 낮은 장애물, 붙잡는 사람)
 * - pounce: 구역 안에서 언제 덮칠지 몰라 그때그때 점프한다 (호랑이, 고양이)
 * - low: 슬라이드나 기어가기로 몸을 낮춘다 (들보, 곰, 기린, 굳건이)
 * - crawl: 기어가기를 유지한다 (감시자 시야, 행진 대열)
 * - lane: 정해진 쪽으로만 지나갈 수 있다 (철책 구멍, 장군 차, 한쪽을 막은 장애물)
 * - sweep: 길을 좌우로 쓸고 다니는 것을 옆으로 피한다 (탐조등, 춤추는 병사, 휴대폰 보는 군인)
 * 옆으로 한 걸음만 비키거나 제자리에서 뛰어넘으면 되는 것(광차, 종유석, 지뢰, 고라니, 멧돼지, 조준선)은 다른 동작을 막지 않으므로 구역을 잡지 않는다.
 */
export type Need = 'jump' | 'pounce' | 'low' | 'crawl' | 'lane' | 'sweep';

/** 장애물 하나(또는 한 무리)가 코스에서 차지하는 구역. 이 구역을 지나는 동안 need 동작을 하고 있어야 한다 */
export interface Zone {
  from: number;
  to: number;
  need: Need;
}

/** 입력 여유(초). 누르는 순간이 이 절반(±0.1초)만큼 어긋나도 피할 수 있어야 한다 */
export const SLACK = 0.2;

/** 점프 한 번에 떠 있는 시간(초) */
const AIR = (2 * JUMP_V) / GRAVITY;
/** 붙잡는 사람을 넘으려면 발이 올라가야 하는 높이(m). 낮은 장애물(0.45m)보다 높아 이 값을 기준으로 삼는다 */
const CLEAR = 0.6;
/**
 * 동물(호랑이, 고양이, 고라니, 멧돼지)을 넘으려면 발이 올라가야 하는 높이(m).
 * 동물은 빠르게 움직여 박자를 맞추기 어려우므로 붙잡는 사람보다 낮게 잡는다. 점프 한 번에 약 0.54초 동안 넘겨 있다.
 */
export const CLEAR_ANIMAL = 0.5;

/**
 * 뛰어오른 뒤 발이 지정한 높이에 닿을 때까지 걸리는 시간을 반환한다.
 * @author heojeehaeng(claude)
 * @param {number} h 높이(m)
 * @return {number} 걸리는 시간(초)
 */
function riseT(h: number): number {
  return (JUMP_V - Math.sqrt(JUMP_V * JUMP_V - 2 * GRAVITY * h)) / GRAVITY;
}

/**
 * 점프 한 번에 발이 지정한 높이보다 위에 머무는 시간을 반환한다.
 * @author heojeehaeng(claude)
 * @param {number} h 높이(m)
 * @return {number} 머무는 시간(초)
 */
function overT(h: number): number {
  return (2 * Math.sqrt(JUMP_V * JUMP_V - 2 * GRAVITY * h)) / GRAVITY;
}

/** 점프 한 번으로 함께 넘을 수 있는 구역의 최대 길이(m). 느릴수록 짧아지므로 기본 속도로 잰다 */
export const ONE_JUMP = (overT(CLEAR) - SLACK) * SPEED_BASE;

// 아래 간격은 모두 앞 구역의 끝에서 뒤 구역의 시작까지의 최소 거리(m)다.
// 빠를수록 같은 시간에 더 멀리 가므로 최고 속도로 잰다. 부스터로 더 빨라지는 것은 플레이어의 선택이라 넣지 않는다.

/** 점프 → 점프. 앞의 것을 일찍 뛰어 넘고, 내려서 다시 뛰어 뒤의 것을 넘는다. 공중에서 누른 점프는 버려지므로 착지를 기다려야 한다 */
const JUMP_AGAIN = (AIR + 2 * SLACK - overT(CLEAR)) * SPEED_MAX;
/** 점프 → 몸 낮추기. 슬라이드도 땅에 내린 뒤에야 나간다 */
const JUMP_TO_LOW = (AIR + 2 * SLACK - riseT(CLEAR) - overT(CLEAR)) * SPEED_MAX;
/** 점프 → 기어가기. 공중에서 미리 누르고 있으면 내리자마자 엎드리므로 착지할 거리만 있으면 된다 */
const JUMP_TO_CRAWL = (AIR + SLACK - riseT(CLEAR) - overT(CLEAR)) * SPEED_MAX;
/** 덮치는 동물 구역 → 다음 동작. 구역 끝에서 덮치면 그때 뛰어야 하므로 한 번의 점프를 다 마칠 거리를 둔다 */
const POUNCE_OUT = (AIR - riseT(CLEAR_ANIMAL) + SLACK) * SPEED_MAX;
/** 몸 낮추기 → 점프. 슬라이드 중에 점프하면 바로 일어나 뛰지만, 슬라이드 동안은 1.3배로 빨리 다가간다 */
const LOW_TO_JUMP = (SLACK + riseT(CLEAR_ANIMAL)) * SPEED_MAX * SLIDE_MULT;
/** 기어가기 → 점프. 엎드린 채로는 뛸 수 없어 손을 떼고 뛴다. 일어난 직후라 기본 속도로 잰다 */
const CRAWL_TO_JUMP = (SLACK + riseT(CLEAR)) * SPEED_BASE;
/** 길을 쓸고 다니는 것 앞. 탐조등 빛의 반지름(1.9m)만큼 옆으로 비킬 시간을 둔다 */
const INTO_SWEEP = (1.9 / SIDE_SPEED + SLACK) * SPEED_MAX;
/** 지나갈 쪽이 정해진 것 앞. 길 반대쪽 끝에서 철책 구멍까지(4.75m) 옮겨 갈 시간을 둔다 */
const INTO_LANE = (4.75 / SIDE_SPEED + SLACK) * SPEED_MAX;
/** 감시자의 시야와 다음 감시자의 시야 사이. 계속 엎드려만 있지 않도록 숨 돌릴 틈을 둔다 */
const WATCH_GAP = 14;

/**
 * 앞 구역의 동작(바깥 키) 다음에 뒤 구역의 동작(안쪽 키)이 올 때 필요한 최소 간격(m).
 * 값이 없는 조합은 서로 방해하지 않아 겹쳐도 된다. 값이 있는 조합은 겹칠 수 없다.
 */
const GAP: Record<Need, Partial<Record<Need, number>>> = {
  jump: { jump: JUMP_AGAIN, pounce: JUMP_AGAIN, low: JUMP_TO_LOW, crawl: JUMP_TO_CRAWL },
  pounce: { jump: POUNCE_OUT, pounce: POUNCE_OUT, low: POUNCE_OUT, crawl: POUNCE_OUT },
  low: { jump: LOW_TO_JUMP, pounce: LOW_TO_JUMP },
  crawl: { jump: CRAWL_TO_JUMP, pounce: CRAWL_TO_JUMP, crawl: WATCH_GAP, lane: INTO_LANE },
  lane: { crawl: 0, lane: INTO_LANE, sweep: INTO_SWEEP },
  sweep: { lane: INTO_LANE, sweep: INTO_SWEEP },
};

/**
 * 앞뒤로 놓인 두 구역 사이에 필요한 최소 간격을 반환한다.
 * @author heojeehaeng(claude)
 * @param {Need} a 앞 구역의 동작
 * @param {Need} b 뒤 구역의 동작
 * @return {number|undefined} 최소 간격(m). 서로 방해하지 않는 조합이면 undefined
 */
export function gapAfter(a: Need, b: Need): number | undefined {
  return GAP[a][b];
}

/**
 * 플레이어가 가까이 오면 마주 다가오는 것과 실제로 마주치는 거리의 범위를 반환한다.
 * 플레이어가 기본 속도일 때 가장 앞에서, 최고 속도일 때 가장 뒤에서 만난다.
 * @author heojeehaeng(claude)
 * @param {number} d0 처음 서 있는 거리(m)
 * @param {number} speed 다가오는 속도(m/s)
 * @param {number} within 플레이어가 이 거리(m) 안으로 오면 다가오기 시작한다
 * @return {number[]} 마주치는 거리의 [가장 앞, 가장 뒤](m)
 */
export function meet(d0: number, speed: number, within: number): [number, number] {
  return [d0 - (within * speed) / (SPEED_BASE + speed), d0 - (within * speed) / (SPEED_MAX + speed)];
}

/** 한 구간에 놓인 장애물들의 구역을 모아 두고, 새 장애물이 동작 간격을 지키는지 알려 준다 */
export class Plan {
  private zones: Zone[] = [];

  /**
   * 새 구역들이 이미 잡힌 구역들과 동작 간격을 지키려면 얼마나 뒤로 밀어야 하는지 반환한다.
   * @author heojeehaeng(claude)
   * @param {Zone[]} zones 놓으려는 구역들
   * @return {number} 뒤로 밀어야 하는 거리(m). 0이면 그 자리에 놓을 수 있다
   */
  push(zones: Zone[]): number {
    let need = 0;
    for (const n of zones) {
      for (const e of this.zones) {
        const after = GAP[e.need][n.need];
        if (after === undefined) continue;
        const before = GAP[n.need][e.need] ?? after;
        if (n.from >= e.to + after || e.from >= n.to + before) continue;
        // 앞으로 당길 수는 없으므로, 부딪히는 구역을 지나 그 뒤의 간격까지 민다.
        need = Math.max(need, e.to + after - n.from);
      }
    }
    return need;
  }

  /**
   * 놓기로 정한 구역들을 기록한다.
   * @author heojeehaeng(claude)
   * @param {Zone[]} zones 놓은 구역들
   */
  claim(zones: Zone[]): void {
    this.zones.push(...zones);
  }
}

import { DEPOTS, PLAZA, STAGES } from './config';
import { Ctx } from './entities';
import { Scatter } from './props';

const TAU = Math.PI * 2;

/**
 * 시드가 같으면 같은 순서로 난수를 내는 함수를 만든다. 배경은 판마다 바뀌지 않아야 하므로 시드를 고정해 쓴다.
 * @author heojeehaeng(claude)
 * @param {number} seed 시드
 * @return {Function} 0 이상 1 미만의 난수를 내는 함수
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 목록에서 하나를 무작위로 고른다.
 * @author heojeehaeng(claude)
 * @param {Function} rnd 난수 함수
 * @param {T[]} list 목록
 * @return {T} 고른 항목
 */
function pick<T>(rnd: () => number, list: T[]): T {
  return list[Math.floor(rnd() * list.length)];
}

/**
 * 시내의 광장 안이거나 그 둘레인지 반환한다.
 * @author heojeehaeng(claude)
 * @param {number} d 거리(m)
 * @param {number} pad 광장 앞뒤로 더 비워 둘 거리(m)
 * @return {boolean} 광장 자리 여부
 */
function inPlaza(d: number, pad: number): boolean {
  return d > PLAZA.from - pad && d < PLAZA.to + pad;
}

/**
 * SS사단의 창고나 탄약고가 서는 자리인지 반환한다.
 * @author heojeehaeng(claude)
 * @param {number} side -1이면 길 왼쪽, 1이면 오른쪽
 * @param {number} d 거리(m)
 * @param {number} pad 건물 가운데에서 앞뒤로 비워 둘 거리(m)
 * @return {boolean} 건물 자리 여부
 */
function nearDepot(side: number, d: number, pad: number): boolean {
  return DEPOTS.some((p) => p.side === side && Math.abs(p.d - d) < pad);
}

/**
 * 네 구간의 길가와 원경에 배경 모델을 배치한다. 모델을 불러오지 못했으면 아무것도 놓지 않는다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 */
export function buildScenery(c: Ctx): void {
  const s = new Scatter();
  mineScenery(s);
  cityScenery(s);
  dmzScenery(s);
  ssScenery(s);
  s.build((obj, d) => c.addProp(obj, d));
}

/**
 * 탄광 갱도 벽 쪽에 통, 상자, 돌무더기, 도구를 놓는다. 길 안쪽으로는 넘어오지 않게 벽에 붙인다.
 * @author heojeehaeng(claude)
 * @param {Scatter} s 배치 기록
 */
function mineScenery(s: Scatter): void {
  const rnd = rng(11);
  const end = STAGES[0].to;
  // 표지판, 게시판, 벽 파는 동료가 서 있는 자리는 비워 둔다. [쪽, 거리]
  const taken: [number, number][] = [[-1, 30], [1, 178], [-1, 337.5], [1, end - 14], [-1, 225], [-1, 465], [-1, 637.5]];
  for (let d = 10; d < end - 8; d += 2.5 + rnd() * 4.5) {
    const side = rnd() < 0.5 ? -1 : 1;
    // 받침목 기둥(12.5m 간격)과 겹치는 자리는 건너뛴다.
    const post = Math.abs(((d - 6) % 12.5) - 6.25) > 5.3;
    if (post || taken.some(([ts, td]) => ts === side && Math.abs(td - d) < 3.5)) continue;
    const x = side * (4.2 + rnd() * 0.15);
    const ry = rnd() * TAU;
    const r = rnd();
    if (r < 0.2) {
      s.put('survival/barrel', x, d, { h: 0.95, ry });
      if (rnd() < 0.5) s.put('survival/barrel', x, d + 0.75, { h: 0.95, ry: ry + 1 });
    } else if (r < 0.4) {
      s.put('survival/box', x, d, { h: 0.62, ry: ry * 0.1 });
      if (rnd() < 0.6) s.put('survival/box', x, d, { h: 0.55, y: 0.62, ry: 0.4 });
      if (rnd() < 0.5) s.put('survival/box-large', x, d + 1.1, { h: 0.6, ry: 0.1 });
    } else if (r < 0.55) s.put('survival/resource-stone-large', x, d, { w: 1.0, ry });
    else if (r < 0.66) s.put('survival/resource-planks', x, d, { w: 0.7, ry: ry * 0.15 });
    else if (r < 0.76) s.put('survival/bucket', x, d, { h: 0.4, ry });
    else if (r < 0.86) s.put(rnd() < 0.5 ? 'survival/rock-a' : 'survival/rock-b', x + side * 0.1, d, { h: 0.7 + rnd() * 0.5, ry });
    else if (r < 0.93) s.put('survival/tool-pickaxe', x + side * 0.25, d, { h: 0.95, ry: side * Math.PI * 0.5, lean: 0.3 });
    else s.put('survival/tool-shovel', x + side * 0.25, d, { h: 1.15, ry: side * Math.PI * 0.5, lean: 0.25 });
  }
}

/**
 * 북한 시내 길 뒤편에 입체 건물, 굴뚝, 급수탑, 가로수를 놓는다. 색은 바랜 콘크리트 느낌으로 낮춘다.
 * @author heojeehaeng(claude)
 * @param {Scatter} s 배치 기록
 */
function cityScenery(s: Scatter): void {
  const rnd = rng(12);
  const { from, to } = STAGES[1];
  const drab = [0xf4f0e8, 0xe6e8ea, 0xe2dcd0, 0xf0e8dc, 0xe8ecee];
  const near = ['commercial/building-a', 'commercial/building-c', 'commercial/building-e', 'commercial/building-g', 'commercial/building-k', 'commercial/building-n'];
  const far = ['commercial/low-detail-building-a', 'commercial/low-detail-building-b', 'commercial/low-detail-building-f', 'commercial/low-detail-building-wide-a'];
  // 류경호텔 입간판이 선 자리. 그 주변 왼쪽에는 건물을 세우지 않는다.
  const hotelAt = from + 190;
  for (const side of [-1, 1]) {
    // 길에서 가까운 건물 줄: 정면이 길을 보게 돌려 세운다.
    for (let d = from + 14; d < to - 6; d += 13 + rnd() * 6) {
      // 광장 안에는 길가 건물을 세우지 않는다.
      if ((side < 0 && Math.abs(d - hotelAt) < 26) || inPlaza(d, 8)) continue;
      const tall = rnd() < 0.12;
      const key = tall ? pick(rnd, ['commercial/building-skyscraper-a', 'commercial/building-skyscraper-c']) : pick(rnd, near);
      s.put(key, side * (24 + rnd() * 5), d, { h: tall ? 24 + rnd() * 8 : 10 + rnd() * 6, ry: -side * Math.PI * 0.5, tint: pick(rnd, drab) });
    }
    // 먼 건물 줄: 단순한 모델을 촘촘히 세워 스카이라인을 만든다.
    for (let d = from + 4; d < to; d += 7 + rnd() * 5) {
      const x = 42 + rnd() * 30;
      // 광장 바닥과 주석단 건물이 놓이는 자리에서는 먼 건물도 그 뒤로 물린다.
      s.put(pick(rnd, far), side * (inPlaza(d, 10) ? Math.max(x, 60) : x), d, { h: 16 + rnd() * 24, ry: Math.floor(rnd() * 4) * Math.PI * 0.5, tint: pick(rnd, drab) });
    }
    // 공장 굴뚝과 급수탑
    for (let d = from + 60 + rnd() * 40; d < to - 30; d += 130 + rnd() * 70) {
      const x = side * (34 + rnd() * 6);
      if (inPlaza(d, 14)) continue;
      if (rnd() < 0.6) {
        s.put('industrial/chimney-large', x, d, { h: 24 + rnd() * 8, tint: 0xc9c2b8 });
        s.put('industrial/building-a', x + side * 3, d + 9, { h: 9, ry: -side * Math.PI * 0.5, tint: 0xc4c0b8 });
      } else s.put('industrial/water-tower', x, d, { h: 13, tint: 0xc9c9c9 });
    }
    // 가로수: 촛불 가로등(55m 간격) 사이에 선다.
    for (let d = from + 38; d < to - 20; d += 27.5) {
      if ((Math.abs(d - hotelAt) < 12 && side < 0) || inPlaza(d, 2)) continue;
      s.put('nature/tree_default', side * 9.8, d + (side > 0 ? 6 : 0), { h: 4.2 + rnd() * 1.2, ry: rnd() * TAU, tint: 0xd6dcc4 });
    }
  }
  // 탄광을 나오자마자 보이는 광업소 건물과 저장 탱크
  s.put('industrial/building-p', -17, from + 16, { h: 6.5, ry: Math.PI * 0.5, tint: 0xbdb7ac });
  s.put('industrial/detail-tank-large', 16, from + 10, { h: 4.5, tint: 0xb8b4ac });
  s.put('industrial/chimney-large', -24, from + 26, { h: 26, tint: 0xbdb7ac });
}

/**
 * 국경과 DMZ에 소나무 숲, 덤불과 풀, 바위, 철책, 북한군 천막을 놓는다. 양옆의 산줄기는 landmarks.ts에서 따로 세운다.
 * 길 가까이에는 낮은 것만 놓아 옆에서 뛰어드는 동물이 가려지지 않게 한다.
 * @author heojeehaeng(claude)
 * @param {Scatter} s 배치 기록
 */
function dmzScenery(s: Scatter): void {
  const rnd = rng(13);
  const { from, to } = STAGES[2];
  const len = to - from;
  // 새벽 안개 톤에 맞춰 숲의 초록을 조금 차갑게 누른다.
  const green = [0xdde6e4, 0xcbdad2, 0xc0d2c8, 0xd6dccf];
  const pines = ['nature/tree_pineDefaultA', 'nature/tree_pineDefaultB', 'nature/tree_pineTallA', 'nature/tree_pineRoundC'];
  for (let i = 0; i < 460; i++) {
    const d = from + 12 + rnd() * (len - 16);
    const x = (rnd() < 0.5 ? -1 : 1) * (9.5 + Math.pow(rnd(), 1.4) * 36);
    const oak = rnd() < 0.18;
    s.put(oak ? 'nature/tree_oak' : pick(rnd, pines), x, d, { h: oak ? 4.5 + rnd() * 2 : 5.5 + rnd() * 5, ry: rnd() * TAU, tint: pick(rnd, green) });
  }
  for (let i = 0; i < 620; i++) {
    const d = from + 10 + rnd() * (len - 14);
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (4.9 + rnd() * 10);
    const lowOnly = Math.abs(x) < 8;
    const ry = rnd() * TAU;
    const r = rnd();
    if (r < 0.42) s.put('nature/grass_large', x, d, { h: 0.4 + rnd() * 0.2, ry, tint: pick(rnd, green) });
    else if (r < 0.6) s.put('nature/plant_bush', x, d, { h: 0.6 + rnd() * 0.25, ry, tint: pick(rnd, green) });
    else if (r < 0.7) s.put(rnd() < 0.5 ? 'nature/flower_redA' : 'nature/flower_yellowA', x, d, { h: 0.5, ry });
    else if (r < 0.76) s.put('nature/mushroom_redGroup', x, d, { h: 0.35, ry });
    else if (r < 0.84) s.put('nature/rock_largeA', x, d, { w: 1.1 + rnd() * 0.8, ry });
    else if (r < 0.9) s.put('nature/stump_old', x, d, { h: 0.5, ry });
    else if (lowOnly) s.put('nature/grass_large', x, d, { h: 0.5, ry });
    else if (r < 0.95) s.put('nature/plant_bushLarge', x, d, { h: 1.0 + rnd() * 0.4, ry, tint: pick(rnd, green) });
    else s.put('nature/log_stack', x, d, { h: 0.8, ry });
  }
  for (let i = 0; i < 70; i++) {
    const d = from + 12 + rnd() * (len - 16);
    s.put(rnd() < 0.5 ? 'nature/rock_tallB' : 'nature/rock_largeB', (rnd() < 0.5 ? -1 : 1) * (12 + rnd() * 22), d, { h: 1.6 + rnd() * 2.2, ry: rnd() * TAU });
  }
  // 국경 철책: 길 위의 개구멍 장애물에서 양옆으로 이어진다.
  fenceRow(s, from + 7.6, 0x98a8ac);
  // 허수아비 군인 옆의 북한군 천막과 보급 상자
  [0.12, 0.38, 0.61, 0.83].forEach((f, i) => {
    const side = i % 2 ? -1 : 1;
    const d = from + len * f;
    s.put('survival/tent-canvas', side * 11, d + 3.5, { h: 2.6, ry: -side * Math.PI * 0.5, tint: 0xb9b48e });
    s.put('survival/box-large', side * 9.6, d + 1.6, { h: 0.65, ry: 0.3 });
    s.put('survival/barrel', side * 9.4, d + 5.4, { h: 0.95 });
  });
}

/**
 * 길을 가로지르는 방향으로 철책을 양옆에 한 줄 세운다. 길 위 부분은 장애물이 따로 그리므로 비운다.
 * @author heojeehaeng(claude)
 * @param {Scatter} s 배치 기록
 * @param {number} d 철책이 서는 거리(m)
 * @param {number} tint 철책 색
 */
function fenceRow(s: Scatter, d: number, tint: number): void {
  const w = 2.1;
  for (const side of [-1, 1]) for (let k = 0; k < 20; k++) s.put('survival/fence-fortified', side * (5.4 + k * w), d, { h: 2.2, tint });
}

/**
 * SS사단 길 양옆에 부대 울타리를 두르고, 그 너머에 컨테이너, 창고, 막사, 급수탑, 소나무를 놓는다.
 * @author heojeehaeng(claude)
 * @param {Scatter} s 배치 기록
 */
function ssScenery(s: Scatter): void {
  const rnd = rng(14);
  const { from, to } = STAGES[3];
  const army = [0xb4bca4, 0xa8b09c, 0xc0c4b0];
  fenceRow(s, from + 7, 0x8ea4ac);
  for (const side of [-1, 1]) {
    // 부대 울타리: 초소와 고라니가 서는 자리 바깥쪽에 길 따라 이어 세운다.
    for (let d = from + 12; d < to - 6; d += 2.1) s.put('survival/fence-fortified', side * 13.2, d, { h: 2.2, ry: Math.PI * 0.5, tint: 0x8ea4ac });
    for (let d = from + 20 + rnd() * 10; d < to - 20; d += 16 + rnd() * 14) {
      const x = side * (16.5 + rnd() * 6);
      const r = rnd();
      // 창고와 탄약고가 서는 자리는 비워 둔다.
      if (nearDepot(side, d, 17)) continue;
      if (r < 0.28) {
        s.put(rnd() < 0.5 ? 'industrial/shipping-container-a' : 'industrial/shipping-container-b', x, d, { h: 2.8, ry: rnd() < 0.5 ? 0 : Math.PI * 0.5, tint: pick(rnd, army) });
      } else if (r < 0.46) s.put('survival/structure-metal', x, d, { h: 3.2, ry: -side * Math.PI * 0.5, tint: pick(rnd, army) });
      else if (r < 0.6) s.put('industrial/detail-tank-large', x, d, { h: 3.4, tint: pick(rnd, army) });
      else if (r < 0.8) {
        s.put('survival/box-large', x, d, { h: 0.9, ry: 0.2 });
        s.put('survival/box', x + 0.2, d + 1.3, { h: 0.8, ry: 0.5 });
        s.put('survival/barrel', x - 0.9, d + 0.4, { h: 1.0 });
      } else s.put('survival/tent-canvas', x, d, { h: 3.0, ry: -side * Math.PI * 0.5, tint: 0x8f9a78 });
    }
    // 창고와 급수탑은 더 뒤쪽에 듬성듬성 세운다.
    for (let d = from + 40 + rnd() * 30; d < to - 30; d += 60 + rnd() * 40) {
      const x = side * (30 + rnd() * 8);
      if (nearDepot(side, d, 18)) continue;
      if (rnd() < 0.75) s.put(rnd() < 0.5 ? 'industrial/building-h' : 'industrial/building-p', x, d, { h: 6.5 + rnd() * 1.5, ry: -side * Math.PI * 0.5, tint: pick(rnd, army) });
      else s.put('industrial/water-tower', x, d, { h: 12, tint: 0xb0b4a8 });
    }
    for (let d = from + 10; d < to; d += 9 + rnd() * 12) {
      const x = 24 + rnd() * 26;
      // 창고 지붕이나 탄약고 둔덕을 뚫고 자라지 않게 그 자리의 소나무는 뒤로 물린다.
      s.put(pick(rnd, ['nature/tree_pineDefaultA', 'nature/tree_pineTallA', 'nature/tree_pineRoundC']), side * (nearDepot(side, d, 13) ? Math.max(x, 38) : x), d, { h: 6 + rnd() * 4, ry: rnd() * TAU, tint: 0xd2e6c4 });
    }
  }
  // 생활관 앞에 쌓아 둔 보급품
  s.put('survival/box-large', -4.6, to - 2.2, { h: 0.8, ry: 0.2 });
  s.put('survival/box', -4.4, to - 2.2, { h: 0.7, y: 0.8, ry: 0.5 });
  s.put('survival/barrel', -5.6, to - 1.6, { h: 1.0 });
  s.put('survival/barrel', 5.2, to - 1.4, { h: 1.0 });
}

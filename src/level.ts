import * as THREE from 'three';
import { CHECKPOINTS, COURSE_LEN, STAGES, stagePos } from './config';
import {
  Barrier, Bear, Cart, Crowd, Ctx, Entity, Giant, Giraffe, Grabber, Hint, Limo, makeBoarEnemy, makeCatEnemy,
  LDancer, makeDeerEnemy, makeTigerEnemy, Mascot, Mine, PhoneWalker, pickTaunt, Searchlight, Shooter, Stalactite, Truck, Watcher,
} from './entities';
import { box, makeCutout, makeDeer, makePerson, makeSign, mat, PersonOpts } from './models';
import { hasProps } from './props';
import { buildScenery } from './scenery';

export interface Decor {
  /** 생활관 문의 경첩 관절. y축으로 돌리면 문이 열린다 */
  door: THREE.Group;
  /** 문을 열고 나오는 라면 먹던 병사 */
  greeter: THREE.Group;
}

type Put = <T extends THREE.Object3D>(obj: T, x: number, d: number, ry?: number) => T;

const MINER: PersonOpts = { shirt: 0x8a765c, pants: 0x4a4038, hat: 0xd9a441, hatKind: 'helmet', face: 'calm' };
/** 탄광을 지키는 간수 */
const GUARD: PersonOpts = { shirt: 0x3a3f4a, pants: 0x2a2d35, hat: 0x2a2d35, hatKind: 'officer', boots: true, face: 'angry', badge: 0xc0261c };
const PARTY: PersonOpts = { shirt: 0x34404f, pants: 0x2b3440, hat: 0x34404f, face: 'angry', armband: 0xc0261c, badge: 0xc0261c };
const PARTY_GUN: PersonOpts = { shirt: 0x6a3a2c, pants: 0x2b3440, hat: 0x6a3a2c, face: 'angry', armband: 0xc0261c, badge: 0xf0c020 };
const NK_SOLDIER: PersonOpts = { shirt: 0x66783f, pants: 0x55662f, hat: 0x66783f, hatKind: 'officer', boots: true, face: 'angry', badge: 0xc0261c };
/** 한국군 병사. 화강암 디지털 무늬 전투복과 전투모를 입는다. 색 값은 무늬가 안 쓰이는 허리띠와 모자 테에만 쓰인다 */
export const ROK_SOLDIER: PersonOpts = { shirt: 0x5c6a44, pants: 0x4a5638, hat: 0x4a5638, camo: true, boots: true };
/** 달려오는 동물이 두 마리일 때 둘 사이의 거리(m). 서로 약 1초 간격으로 도착한다 */
const PAIR_GAP = 50;
/** 감시자의 시야와 다음 감시자의 시야 사이에 비워 두는 거리(m) */
const WATCH_GAP = 14;

/**
 * 같은 시드에서 항상 같은 순서의 난수를 만드는 함수를 반환한다.
 * @author heojeehaeng(claude)
 * @param {number} seed 시드 값
 * @return {Function} 0 이상 1 미만의 난수를 반환하는 함수
 */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 종류별 장수를 정해 둔 패에서 한 장씩 뽑는 함수를 만든다. 패가 떨어지면 다시 섞어 채운다.
 * 다시 배치해도 종류별 개수가 비슷하게 유지되도록 하기 위한 것이다.
 * @author heojeehaeng(claude)
 * @param {Function} rnd 난수 함수
 * @param {Object} counts 종류 이름과 한 벌에 들어가는 장수
 * @return {Function} 종류 이름을 하나 뽑아 반환하는 함수
 */
function deck<T extends string>(rnd: () => number, counts: Record<T, number>): () => T {
  let bag: T[] = [];
  return () => {
    if (!bag.length) for (const k of Object.keys(counts) as T[]) for (let i = 0; i < counts[k]; i++) bag.push(k);
    return bag.splice(Math.floor(rnd() * bag.length), 1)[0];
  };
}

/**
 * 체크포인트 바로 앞뒤를 피한 거리를 반환한다.
 * 다시 출발하자마자 적에게 걸리지 않도록 체크포인트 주변은 비워 둔다.
 * @author heojeehaeng(claude)
 * @param {number} d 놓으려는 거리(m)
 * @return {number} 조정된 거리(m)
 */
function clearOfCheckpoint(d: number): number {
  for (const cp of CHECKPOINTS) if (d > cp - 12 && d < cp + 40) return cp + 40;
  return d;
}

/**
 * 구간의 한 범위에 자리를 잡아 배치 함수를 부른다. 뒤로 갈수록 간격을 좁혀 어렵게 한다.
 * 자리 수는 난수와 상관없이 정해지고 위치만 조금씩 흔들리므로, 다시 배치해도 개수와 난이도가 비슷하다.
 * @author heojeehaeng(claude)
 * @param {number} from 시작 거리(m)
 * @param {number} to 끝 거리(m)
 * @param {number} gapStart 범위 처음의 간격(m)
 * @param {number} gapEnd 범위 끝의 간격(m)
 * @param {Function} rnd 난수 함수
 * @param {Function} place 배치 함수 (거리, 진행도 0~1). 이 자리 뒤로 비워 둘 길이(m)를 반환한다
 */
function along(from: number, to: number, gapStart: number, gapEnd: number, rnd: () => number, place: (d: number, k: number) => number): void {
  const gapAt = (d: number) => gapStart + (gapEnd - gapStart) * ((d - from) / (to - from));
  const slots: number[] = [];
  for (let d = from; d < to; d += gapAt(d)) slots.push(d);
  let skipUntil = 0;
  for (const base of slots) {
    const d = clearOfCheckpoint(base + (rnd() - 0.5) * gapAt(base) * 0.6);
    if (d < skipUntil || d >= to) continue;
    skipUntil = d + place(d, (base - from) / (to - from));
  }
}

/**
 * 네 구간의 적과 장애물을 배치한다. 시드가 다르면 위치와 순서가 달라지지만 개수와 난이도는 비슷하다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @param {number} seed 배치 시드
 * @return {Entity[]} 갱신 순서대로 정렬한 적 목록
 */
export function buildEntities(c: Ctx, seed: number): Entity[] {
  const es: Entity[] = [];
  mineEntities(c, es, seeded(seed + 1));
  cityEntities(c, es, seeded(seed + 2));
  dmzEntities(c, es, seeded(seed + 3));
  ssEntities(c, es, seeded(seed + 4));
  es.sort((a, b) => (a.order ?? 1) - (b.order ?? 1));
  return es;
}

/**
 * 아오지 탄광의 적을 배치한다. 앞부분에서 조작을 익히고, 뒤로 갈수록 동료, 광차, 종유석이 촘촘해진다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @param {Entity[]} es 적 목록
 * @param {Function} rnd 난수 함수
 */
function mineEntities(c: Ctx, es: Entity[], rnd: () => number): void {
  const end = STAGES[0].to;
  es.push(new Barrier(c, 100, 'low'));
  es.push(new Barrier(c, 185, 'high'));
  es.push(new Hint(262, '동료와 간수는 점프로 넘고, 광차와 떨어지는 돌은 피하세요'));
  const pick = deck(rnd, { grab: 3, cart: 2, low: 2, high: 2, rocks: 3 });
  along(290, end - 12, 30, 15, rnd, (d, k) => {
    const kind = pick();
    const x = (rnd() * 2 - 1) * 3;
    // 붙잡는 사람의 절반은 동료, 절반은 욕을 퍼붓는 간수다.
    const miner = (dd: number, gx: number) => {
      const guard = rnd() < 0.5;
      const look = guard ? GUARD : { ...MINER, pot: rnd() < 0.5 };
      es.push(new Grabber(c, dd, gx, look, guard ? pickTaunt() : '"동무, 어디 가오!"', 4.5 + k * 1.5, guard));
    };
    if (kind === 'grab') {
      // 여럿이 나올 때는 앞뒤와 좌우를 흩어 한 줄로 서지 않게 한다.
      miner(d, x);
      if (k > 0.3) miner(d + 3 + rnd() * 6, (rnd() * 2 - 1) * 3.2);
      if (k > 0.65) miner(d + 8 + rnd() * 6, (rnd() * 2 - 1) * 3.2);
    } else if (kind === 'cart') {
      es.push(new Cart(c, d + 35, [-2, 0, 2][Math.floor(rnd() * 3)]));
      if (k > 0.5) es.push(new Cart(c, d + 48, [-2, 0, 2][Math.floor(rnd() * 3)]));
    } else if (kind === 'low') {
      es.push(rnd() < 0.5 ? new Barrier(c, d, 'low') : new Barrier(c, d, 'low', x < 0 ? -1.9 : 1.9, 4.8));
    } else if (kind === 'high') {
      es.push(new Barrier(c, d, 'high'));
    } else {
      // 종유석이 줄지어 떨어지는 자리
      const n = 2 + Math.round(k * 2);
      for (let i = 0; i < n; i++) es.push(new Stalactite(c, d + i * 3.5, (rnd() * 2 - 1) * 3.4));
    }
    return 0;
  });
  // 다른 장애물 사이사이에 하나씩 떨어지는 종유석
  along(270, end - 10, 46, 28, rnd, (d) => {
    es.push(new Stalactite(c, d, (rnd() * 2 - 1) * 3.4));
    return 0;
  });
}

/**
 * 북한 시내의 적을 배치한다. 감시하는 공산당원, 붙잡는 공산당원, 총 쏘는 공산당원이 나온다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @param {Entity[]} es 적 목록
 * @param {Function} rnd 난수 함수
 */
function cityEntities(c: Ctx, es: Entity[], rnd: () => number): void {
  const { from, to } = STAGES[1];
  es.push(new Hint(from + 6, '붉은 시야에 닿으면 바로 발각! 아래 방향키(길게 누르기)로 죽은 척하면 들키지 않고 천천히 기어갑니다'));
  // 감시자의 시야가 닿는 마지막 거리. 다음 감시자는 이 뒤로 숨 돌릴 틈을 두고 세운다.
  let watchEnd = 0;
  /**
   * 감시자를 세운다. 앞선 감시자의 시야와 겹치면 겹치지 않는 자리까지 뒤로 민다.
   * @author heojeehaeng(claude)
   * @param {number} d 세우려는 거리(m)
   * @param {number} side -1이면 길 왼쪽, 1이면 오른쪽
   * @param {number} range 시야 거리(m)
   * @param {number} rate 고개 돌리는 빠르기(rad/s)
   * @return {number} 이 감시자의 시야가 끝나는 거리(m)
   */
  const watch = (d: number, side: number, range: number, rate: number): number => {
    const at = clearOfCheckpoint(Math.max(d, watchEnd + range + WATCH_GAP));
    es.push(new Watcher(c, at, side, rnd() * 6, range, rate, pickTaunt()));
    watchEnd = at + range;
    return watchEnd;
  };
  watch(from + 80, -1, 10, 1.3);
  es.push(new Hint(from + 115, '행진 대열에 섞이면 들키지 않습니다'));
  es.push(new Hint(from + 200, '붙잡는 공산당원은 점프로 넘으세요'));
  es.push(new Crowd(c, from + 150, from + 182, 0));
  watch(from + 166, 1, 10, 1.3);
  es.push(new Truck(c, from + 36, -8.4, to - 20));
  let side = 1;
  const pick = deck(rnd, { watch: 3, grab: 3, shoot: 2, low: 1, high: 1, crowd: 1, combo: 1 });
  along(from + 225, to - 25, 33, 19, rnd, (d, k) => {
    const kind = pick();
    side = -side;
    const x = (rnd() * 2 - 1) * 3;
    const grab = (dd: number, gx: number) => es.push(new Grabber(c, dd, gx, PARTY, pickTaunt(), 4.5 + k * 2, true));
    if (kind === 'watch') {
      // 감시자는 한 번에 한 명만 세우고, 시야가 끝난 뒤에 다음 적이 나오게 한다.
      return watch(d, side, 10 + rnd() * 2.5, 1.2 + k * 0.9) - d + 4;
    }
    if (kind === 'grab') {
      grab(d, x);
      if (k > 0.3) grab(d + 3 + rnd() * 6, (rnd() * 2 - 1) * 3.2);
      if (k > 0.7) grab(d + 8 + rnd() * 6, (rnd() * 2 - 1) * 3.2);
      return 0;
    }
    if (kind === 'shoot') {
      es.push(new Shooter(c, d, side, PARTY_GUN, 1.5 - k * 0.5, pickTaunt()));
      return 0;
    }
    if (kind === 'low') {
      es.push(new Barrier(c, d, 'low', x < 0 ? -1.8 : 1.8, 5, 0xcc3333));
      return 0;
    }
    if (kind === 'high') {
      es.push(new Barrier(c, d, 'high', 0, 8.6, 0xb22222));
      return 0;
    }
    if (kind === 'crowd') {
      // 행진 대열 옆의 감시자도 한 명만 세운다. 시야가 대열 길이 안에 들어오도록 대열을 감시자에 맞춰 놓는다.
      const end = watch(d + 15, side, 10, 1.4);
      es.push(new Crowd(c, end - 26, end + 2, rnd() < 0.5 ? -0.8 : 0.8));
      return end - d + 6;
    }
    es.push(new Shooter(c, d, side, PARTY_GUN, 1.3, pickTaunt()));
    grab(d + 6, x);
    return 0;
  });
}

/**
 * 국경과 DMZ의 적을 배치한다. 북한군, 지뢰, 곰, 호랑이, 기린, 고라니, 거인이 나온다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @param {Entity[]} es 적 목록
 * @param {Function} rnd 난수 함수
 */
function dmzEntities(c: Ctx, es: Entity[], rnd: () => number): void {
  const { from, to } = STAGES[2];
  es.push(new Barrier(c, from + 8, 'gap', -1.5, 2.8));
  es.push(new Hint(from + 14, '붉은 조준선이 보이면 옆으로 피하거나 슬라이드!'));
  es.push(new Hint(from + 80, '볼록한 흙더미는 지뢰! 피하거나 점프로 넘으세요'));
  es.push(new Hint(from + 150, '곰은 다리 사이로 슬라이드! 기린도 슬라이드, 호랑이는 점프, 고라니는 옆으로'));
  let side = 1;
  along(from + 45, to - 30, 66, 46, rnd, (d, k) => {
    side = -side;
    es.push(new Shooter(c, d, side, NK_SOLDIER, 1.4 - k * 0.5));
    return 0;
  });
  // 동물과 통나무가 놓인 자리. 그 앞뒤에는 지뢰를 두지 않아 피할 길을 남긴다.
  const busy: number[] = [];
  const pick = deck(rnd, { bear: 2, tiger: 2, giraffe: 2, deer: 3, log: 1, giant: 1 });
  along(from + 185, to - 25, 52, 30, rnd, (d, k) => {
    let kind = pick();
    // 거인은 구간 앞쪽에서는 나오지 않는다.
    if (kind === 'giant' && k < 0.2) kind = 'deer';
    busy.push(d);
    if (kind === 'bear') es.push(new Bear(c, d, (rnd() * 2 - 1) * 2));
    else if (kind === 'tiger') es.push(makeTigerEnemy(c, d));
    else if (kind === 'giraffe') es.push(new Giraffe(c, d, rnd() < 0.5 ? -1 : 1));
    else if (kind === 'giant') es.push(new Giant(c, d + 110));
    else if (kind === 'deer') {
      es.push(makeDeerEnemy(c, d + 40, (rnd() * 2 - 1) * 3.4));
      // 뒤쪽에서는 고라니가 두 마리씩 달려온다. 첫 마리를 피한 뒤 다시 움직일 틈이 있도록 간격을 벌린다.
      if (k > 0.45) es.push(makeDeerEnemy(c, d + 40 + PAIR_GAP, (rnd() * 2 - 1) * 3.4));
    } else es.push(new Barrier(c, d, 'low', rnd() < 0.5 ? -1.8 : 1.8, 4.6, 0x5b3a1e));
    return 0;
  });
  along(from + 90, to - 15, 12, 7, rnd, (d, k) => {
    const x = (rnd() * 2 - 1) * 3.3;
    const flag = rnd() > k * 1.1;
    if (busy.some((b) => Math.abs(b - d) < 6)) return 0;
    // 뒤로 갈수록 깃발 없는 지뢰가 많아진다.
    es.push(new Mine(c, d, x, flag));
    return 0;
  });
}

/**
 * SS사단의 적을 배치한다. 탐조등, 고양이, 멧돼지, 휴대폰 보는 군인, 약 올리는 춤을 추는 병사, 장군 차, 굳건이가 나온다.
 * 자리 수는 정해져 있고 종류만 섞어 뽑으므로, 종류를 늘려도 전체 수는 늘지 않는다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @param {Entity[]} es 적 목록
 * @param {Function} rnd 난수 함수
 */
function ssEntities(c: Ctx, es: Entity[], rnd: () => number): void {
  const { from, to } = STAGES[3];
  es.push(new Barrier(c, from + 7, 'gap', 1.5, 2.8));
  es.push(new Hint(from + 12, '탐조등 빛에 닿으면 바로 발각! 빛이 지나간 뒤 달리세요'));
  let side = 1;
  let lastFence = from;
  const pick = deck(rnd, { light: 3, phone: 2, cat: 2, boar: 2, limo: 2, ldance: 2, mascot: 1, fence: 1 });
  along(from + 55, to - 34, 21, 11, rnd, (d, k) => {
    let kind = pick();
    side = -side;
    // 철책은 너무 붙어 나오지 않게 하고, 그 자리에는 고양이를 대신 둔다.
    if (kind === 'fence' && d - lastFence < 90) kind = 'cat';
    if (kind === 'light') {
      es.push(new Searchlight(c, d, side, rnd() * 6, 1.0 + k * 0.6 + rnd() * 0.2));
      return 5;
    }
    if (kind === 'phone') {
      es.push(new PhoneWalker(c, d + 30, 1.5 + rnd() * 1.8));
      if (k > 0.4) es.push(new PhoneWalker(c, d + 37, 1.5 + rnd() * 1.8));
    } else if (kind === 'cat') es.push(makeCatEnemy(c, d));
    else if (kind === 'boar') {
      es.push(makeBoarEnemy(c, d + 45, (rnd() * 2 - 1) * 3.4));
      if (k > 0.5) es.push(makeBoarEnemy(c, d + 45 + PAIR_GAP, (rnd() * 2 - 1) * 3.4));
    } else if (kind === 'limo') es.push(new Limo(c, d + 90, rnd() < 0.5 ? -1.9 : 1.9));
    else if (kind === 'mascot') es.push(new Mascot(c, d + 35));
    else if (kind === 'ldance') es.push(new LDancer(c, d + 30, (rnd() * 2 - 1) * 1.0, 1.8 + rnd() * 0.8, 2.8 + rnd() * 0.8));
    else {
      lastFence = d;
      es.push(new Barrier(c, d, 'gap', (rnd() * 2 - 1) * 2.2, 2.8));
    }
    return 0;
  });
}

/**
 * 다시 배치해도 바뀌지 않는 배경 소품과 결승 생활관을 만든다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @return {Decor} 결승 연출용 문과 병사
 */
export function buildDecor(c: Ctx): Decor {
  const put: Put = (obj, x, d, ry = 0) => {
    obj.position.x = x;
    obj.position.z = -d;
    obj.rotation.y = ry;
    c.addProp(obj, d);
    return obj;
  };
  mineDecor(put);
  cityDecor(put);
  dmzDecor(put);
  for (const cp of CHECKPOINTS) {
    if (cp === 0) continue;
    const flag = new THREE.Group();
    flag.add(box(0.08, 2.6, 0.08, 0xdddddd, 0, 1.3, 0), box(0.9, 0.5, 0.04, 0x2ecc71, 0.48, 2.3, 0));
    put(flag, -4.4, cp);
  }
  buildScenery(c);
  return ssDecor(c, put);
}

/**
 * 아오지 탄광의 코미디 소품을 배치한다.
 * @author heojeehaeng(claude)
 * @param {Put} put 소품 배치 함수
 */
function mineDecor(put: Put): void {
  const end = STAGES[0].to;
  put(makeSign('오늘의 생산 목표\n달성률 1,200%', 2.4, 1.2, '#1f3d2b', '#ffffff', 1.6), -4.1, 30, 0.3);
  const safety = put(makeSign('안전제일', 1.8, 0.7, '#ffd23f', '#1a1a1a', 2.2), 4.2, 178, -0.3);
  safety.rotation.z = 0.35;
  const board = makeCutout((g, w, h) => {
    g.fillStyle = '#7a1f1f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe9a8';
    g.font = `bold ${h * 0.16}px sans-serif`;
    g.textAlign = 'center';
    g.fillText('이달의 모범 일꾼', w / 2, h * 0.2);
    // 사진 여섯 장이 전부 같은 얼굴이다.
    for (let i = 0; i < 6; i++) {
      const fx = w * (0.2 + (i % 3) * 0.3);
      const fy = h * (0.45 + Math.floor(i / 3) * 0.3);
      g.fillStyle = '#f1c9a5';
      g.beginPath();
      g.arc(fx, fy, h * 0.1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#222';
      g.fillRect(fx - h * 0.05, fy - h * 0.02, h * 0.025, h * 0.025);
      g.fillRect(fx + h * 0.025, fy - h * 0.02, h * 0.025, h * 0.025);
      g.fillRect(fx - h * 0.04, fy + h * 0.04, h * 0.08, h * 0.012);
    }
  }, 2.8, 1.9);
  put(board, -4.3, stagePos('mine', 0.45), 0.35).position.y = 0.9;
  put(makeSign('출구\n(없음)', 1.6, 1.1, '#1e7a3c', '#ffffff', 1.8), 4.1, end - 14, -0.3);
  // 곡괭이가 없어 숟가락으로 벽을 파는 동료
  for (const f of [0.3, 0.62, 0.85]) {
    const digger = put(makePerson(MINER), -4.3, stagePos('mine', f), Math.PI / 2);
    digger.userData.parts.armR.rotation.x = -1.4;
    digger.userData.parts.armR.add(box(0.05, 0.3, 0.05, 0xd0d0d0, 0, -0.6, 0));
  }
}

/**
 * 북한 시내의 코미디 소품을 배치한다.
 * @author heojeehaeng(claude)
 * @param {Put} put 소품 배치 함수
 */
function cityDecor(put: Put): void {
  const { from, to } = STAGES[1];
  // 류경호텔: 뒤에서 각목으로 받친 입간판
  const hotel = makeCutout((g, w, h) => {
    g.fillStyle = '#7f8ea3';
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w * 0.98, h);
    g.lineTo(w * 0.02, h);
    g.closePath();
    g.fill();
    g.fillStyle = '#5d6b80';
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w * 0.62, h);
    g.lineTo(w * 0.38, h);
    g.closePath();
    g.fill();
    g.strokeStyle = '#cfd8e3';
    for (let y = h * 0.12; y < h; y += h * 0.035) {
      const half = (y / h) * w * 0.47;
      g.beginPath();
      g.moveTo(w / 2 - half, y);
      g.lineTo(w / 2 + half, y);
      g.stroke();
    }
  }, 16, 28);
  const hotelAt = from + 190;
  put(hotel, -19, hotelAt, 0.5);
  const colors = ['#e8b4a0', '#a9c9a4', '#a8bfd8', '#e6d59a', '#d0b0d8'];
  const apts = colors.map((color, i) =>
    makeCutout((g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      for (let r = 0; r < 6; r++) {
        for (let k = 0; k < 4; k++) {
          const wx = w * (0.1 + k * 0.22);
          const wy = h * (0.06 + r * 0.155);
          g.fillStyle = '#eaf4ff';
          g.fillRect(wx, wy, w * 0.14, h * 0.09);
          // 창가의 화분도 그림이다.
          if ((r + k + i) % 3 === 0) {
            g.fillStyle = '#b5522d';
            g.fillRect(wx + w * 0.04, wy + h * 0.06, w * 0.06, h * 0.03);
            g.fillStyle = '#2e8b3d';
            g.fillRect(wx + w * 0.055, wy + h * 0.03, w * 0.03, h * 0.035);
          }
        }
      }
    }, 9, 12),
  );
  for (let i = 0, d = from + 18; d < to - 10; i++, d += 38) {
    const s = i % 2 ? 1 : -1;
    if (s < 0 && Math.abs(d - hotelAt) < 30) continue;
    put(apts[i % apts.length].clone(), s * 13.5, d, s < 0 ? 0.25 : -0.25);
    // 합판 건물이 쓰러지지 않게 옆에서 붙들고 있는 사람
    if (i % 3 === 0) put(makePerson({ shirt: 0x556b7a, pants: 0x333333 }), s * 8.6, d + 0.4, s * -1.2);
  }
  put(makeSign('우리는 행복하다\n(웃으시오)', 4.4, 1.9, '#b3261e', '#fff4c2', 2.6), 6.6, from + 54, -0.25);
  put(makeSign('우리는 행복하다\n(웃으시오)', 4.4, 1.9, '#b3261e', '#fff4c2', 2.6), -6.8, stagePos('city', 0.6), 0.25);
  // 음식이 전부 모형인 상점
  const shop = new THREE.Group();
  shop.add(box(3.2, 1, 1.2, 0x9a7b52, 0, 0.5, 0));
  for (let k = -1; k <= 1; k++) shop.add(box(0.5, 0.35, 0.5, [0xe07a5f, 0xf2cc8f, 0x81b29a][k + 1], k * 0.9, 1.18, 0));
  const shopSign = makeSign('눈으로만 보시오', 2.6, 0.6, '#ffffff', '#b3261e', 0);
  shopSign.position.set(0, 1.5, 0);
  shop.add(shopSign);
  put(shop, 7.2, stagePos('city', 0.35), -0.3);
  put(shop.clone(), -7.2, stagePos('city', 0.8), 0.3);
  // 차가 없는 도로에서 수신호하는 교통 안내원
  for (const f of [0.28, 0.72]) {
    const lady = put(makePerson({ shirt: 0x2f6fd1, pants: 0xffffff, hat: 0xffffff, hatKind: 'officer', face: 'smile' }), 6.6, stagePos('city', f), Math.PI);
    lady.userData.parts.armL.rotation.z = 2.4;
    lady.userData.parts.armR.rotation.x = -1.5;
  }
  // 가로등 대신 촛불
  const flame = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const lamp = new THREE.Group();
  lamp.add(box(0.12, 3, 0.12, 0x444444, 0, 1.5, 0), box(0.14, 0.3, 0.14, 0xf5f0e0, 0, 3.15, 0));
  const fire = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), flame);
  fire.position.y = 3.38;
  lamp.add(fire);
  for (let d = from + 25; d < to; d += 55) for (const sx of [-7.2, 7.2]) put(lamp.clone(), sx, d + (sx > 0 ? 12 : 0));
  // 미사일이 풍선이라 바람이 빠지는 퍼레이드 차량
  const parade = new THREE.Group();
  parade.add(box(2.2, 1.0, 6, 0x4e5b3a, 0, 0.9, 0));
  for (const wx of [-1, 1]) for (const wz of [-2, 0, 2]) parade.add(box(0.3, 0.8, 0.8, 0x1e1e1e, wx * 1.05, 0.4, wz));
  const missile = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 5, 10), mat(0xf4a6b8));
  missile.rotation.x = Math.PI / 2;
  missile.rotation.z = 0.12;
  missile.scale.y = 0.9;
  missile.position.set(0.1, 1.75, 0.3);
  parade.add(missile);
  put(parade, 8.6, stagePos('city', 0.5), 0);
  put(parade.clone(), 8.6, stagePos('city', 0.9), 0);
  // 지나가면 박수치는 박수 부대
  for (let k = 0; k < 8; k++) {
    const clap = put(makePerson({ shirt: 0x8a8f94, pants: 0x4a4a4a }), -6.9, to - 60 + k * 1.3, -Math.PI / 2);
    clap.userData.parts.armL.rotation.x = clap.userData.parts.armR.rotation.x = -1.3;
  }
}

/**
 * 국경과 DMZ의 나무와 코미디 소품을 배치한다.
 * @author heojeehaeng(claude)
 * @param {Put} put 소품 배치 함수
 */
function dmzDecor(put: Put): void {
  const rnd = seeded(22);
  const { from, to } = STAGES[2];
  put(makeSign('개구멍\n관계자 외 출입금지', 1.9, 0.9, '#ffffff', '#b3261e', 1.2), 1.1, from + 7.6);
  put(makeSign('지뢰 조심\n(아마도 이쪽 ↙ ↓ ↘)', 2.8, 1.3, '#ffd23f', '#1a1a1a', 1.4), 5.6, from + 84, -0.3);
  const trunk = new THREE.BoxGeometry(0.4, 1.4, 0.4);
  const leafGeo = [new THREE.ConeGeometry(1.4, 3.5, 7), new THREE.ConeGeometry(1.8, 5, 7), new THREE.ConeGeometry(1.5, 6, 7)];
  // 배경 모델을 불러오지 못했을 때만 기본 도형 나무로 숲을 대신한다.
  for (let i = 0; i < (hasProps() ? 0 : 190); i++) {
    const d = from + 8 + rnd() * (to - from - 12);
    const s = rnd() < 0.5 ? -1 : 1;
    const tree = new THREE.Group();
    const gi = Math.floor(rnd() * 3);
    const t = new THREE.Mesh(trunk, mat(0x5b3a1e));
    t.position.y = 0.7;
    const leaf = new THREE.Mesh(leafGeo[gi], mat(rnd() < 0.5 ? 0x2f6b34 : 0x3d7d3a));
    leaf.position.y = 1.2 + [1.75, 2.5, 3][gi];
    tree.add(t, leaf);
    put(tree, s * (10 + rnd() * 24), d);
  }
  // 인원이 모자라 세워 둔 허수아비 군인
  const scare = new THREE.Group();
  scare.add(box(0.12, 1.8, 0.12, 0x8a6a45, 0, 0.9, 0), box(1.4, 0.12, 0.12, 0x8a6a45, 0, 1.3, 0));
  scare.add(box(0.5, 0.5, 0.5, 0xe8d9a8, 0, 1.95, 0), box(0.7, 0.16, 0.7, 0x5a6b3a, 0, 2.28, 0));
  [0.12, 0.38, 0.61, 0.83].forEach((f, i) => put(scare.clone(), i % 2 ? -7.2 : 7.2, stagePos('dmz', f)));
  // 남북 확성기 대결
  for (const s of [-1, 1]) {
    const speaker = new THREE.Group();
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) speaker.add(box(0.9, 0.9, 0.6, s < 0 ? 0x7a2a2a : 0x2a4a7a, (k - 1) * 1, 1 + r * 1, 0));
    speaker.add(box(0.3, 1, 0.3, 0x444444, 0, 0.3, 0));
    put(speaker, s * 8, to - 8 + s * 3, s * -0.6);
  }
}

/**
 * SS사단의 코미디 소품과 결승 생활관을 배치한다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @param {Put} put 소품 배치 함수
 * @return {Decor} 결승 연출용 문 관절과 병사
 */
function ssDecor(c: Ctx, put: Put): Decor {
  const { from, to } = STAGES[3];
  // 조는 초병이 있는 초소
  for (let i = 0, d = from + 50; d < to - 40; i++, d += 105) {
    const s = i % 2 ? -1 : 1;
    const post = new THREE.Group();
    post.add(box(2.2, 0.2, 2.2, 0x4a5a48, 0, 2.5, 0));
    for (const px of [-1, 1]) for (const pz of [-1, 1]) post.add(box(0.15, 2.5, 0.15, 0x4a5a48, px, 1.25, pz));
    const guard = makePerson({ ...ROK_SOLDIER, face: 'sleepy' });
    guard.rotation.set(0.25, Math.PI, 0.3);
    post.add(guard);
    const zzz = makeSign('Zzz', 0.9, 0.5, '#ffffff', '#3355aa', 0);
    zzz.position.set(0.7, 2.0, 0.3);
    post.add(zzz);
    const sign = makeSign('경계 근무 중\n이상 무', 1.6, 0.8, '#f4f0e6', '#222222', 0);
    sign.position.set(0, 3.1, 1.1);
    post.add(sign);
    put(post, s * 9.2, d);
  }
  // 탐조등이 자꾸 비추는 고라니
  const deer = makeDeer();
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.45, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.05;
  deer.add(glow);
  for (const f of [0.15, 0.45, 0.75]) put(deer.clone(), f < 0.4 ? -11 : 11.5, stagePos('ss', f));
  // 계절과 상관없이 제초 중인 이등병
  const mower = put(makePerson(ROK_SOLDIER), 10.5, stagePos('ss', 0.3), Math.PI * 0.8);
  mower.rotation.x = 0.5;
  put(makeSign('무한 제초 중', 1.6, 0.5, '#f4f0e6', '#2e6b34', 0.9), 11.6, stagePos('ss', 0.3) + 1, -0.3);

  // 결승 생활관
  const z = -COURSE_LEN;
  const barracks = new THREE.Group();
  barracks.add(box(18, 5, 8, 0x8d8f7a, 0, 2.5, -4), box(19, 0.5, 9, 0x5d5f4f, 0, 5.2, -4));
  barracks.add(box(1.7, 2.6, 0.2, 0x1e1e1e, 0, 1.3, 0.02));
  for (const wx of [-6, -3.2, 3.2, 6]) barracks.add(box(1.6, 1.2, 0.1, 0xffe9a8, wx, 2.6, 0.06));
  const title = makeSign('SS사단 생활관', 5, 0.9, '#2e4a2e', '#ffffff', 0);
  title.position.set(0, 3.6, 0.1);
  barracks.add(title);
  const knock = makeSign('노크 후 들어오세요\n(초인종 고장)', 1.9, 0.9, '#ffffff', '#222222', 0);
  knock.position.set(2.1, 1.2, 0.12);
  barracks.add(knock);
  barracks.position.z = z;
  c.addProp(barracks, COURSE_LEN);

  const door = new THREE.Group();
  door.position.set(-0.8, 0, z + 0.16);
  door.add(box(1.6, 2.5, 0.1, 0x7a5230, 0.8, 1.25, 0), box(0.1, 0.1, 0.12, 0xd9c36a, 1.4, 1.2, 0.08));
  c.addProp(door, COURSE_LEN);

  const greeter = makePerson({ ...ROK_SOLDIER, face: 'grin' });
  greeter.rotation.y = Math.PI;
  greeter.position.set(0, 0, z - 0.7);
  // 라면 그릇
  greeter.add(box(0.4, 0.2, 0.4, 0xc0392b, 0, 0.95, -0.4));
  // 문 안쪽 양옆에서 함께 맞이하는 생활관 인원
  for (const sx of [-0.58, 0.58]) {
    const mate = makePerson({ ...ROK_SOLDIER, face: 'grin', noShadow: true });
    mate.position.set(sx, 0, 0.95);
    greeter.add(mate);
  }
  greeter.visible = false;
  c.addProp(greeter, COURSE_LEN);
  return { door, greeter };
}

import * as THREE from 'three';
import { FALL_HEAVY, FALL_LIGHT, ROAD_HALF, WARN } from './config';
import {
  box, makeBear, makeBoar, makeBubble, makeCat, makeDeer, makeGiantHead, makeGiraffe, makeLimo, makeMascot, makePerson, makeSign,
  makeTiger, mat,
  PersonOpts, runQuad, swingPerson, textTexture,
} from './models';
import { Player } from './player';
import { meet, Zone } from './spacing';

/** 적과 장애물이 게임에 접근할 때 쓰는 창구 */
export interface Ctx {
  player: Player;
  /** 게임 시작 후 흐른 시간(초). 애니메이션 박자에 쓴다 */
  time: number;
  /** 이번 프레임에 플레이어가 행진 대열 속에 있는지 */
  inCrowd: boolean;
  /** 발각을 알린다. 게이지 없이 곧바로 체크포인트로 돌려보낸다 */
  detect(msg: string): void;
  /** 탈북 실패로 판을 끝낸다 */
  kill(reason: string): void;
  toast(msg: string, sec?: number): void;
  /** 같은 안내 문구는 한 판에 한 번만 띄운다 */
  hintOnce(text: string): void;
  /** 적이 내뱉는 대사를 화면 아래에 자막으로 띄운다 */
  say(text: string): void;
  shake(power: number): void;
  /** 적이나 장애물을 장면에 넣는다. 다시 배치할 때 함께 지워진다 */
  add(obj: THREE.Object3D, d: number, always?: boolean): void;
  /** 다시 배치해도 남는 배경 소품을 장면에 넣는다 */
  addProp(obj: THREE.Object3D, d: number): void;
  animalHit(): void;
}

export interface Entity {
  d: number;
  /** 작을수록 먼저 갱신한다. 행진 대열은 감시자보다 먼저 갱신해야 한다 */
  order?: number;
  /** true면 플레이어와의 거리와 상관없이 항상 갱신한다 */
  always?: boolean;
  update(dt: number, c: Ctx): void;
  reset?(): void;
}

const basic = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** 탄광의 간수와 시내의 공산당원이 리용길에게 퍼붓는 욕 */
const TAUNTS = [
  '이.. 간나 새끼!',
  '갈빗대 순서 바뀌고 싶니?',
  '미제 같은 종간나',
  '양강도 뚝감자처럼 생겼구나야',
  '이 쌍간나, 거기 서라우!',
  '아오지 맛을 덜 봤구나야',
  '네레 죽고 싶어 환장했니?',
  '날래 못 서갔어?',
  '이 반동 새끼!',
  '혁명 정신이 썩어 빠졌구나',
  '강냉이 다 털리고 싶니?',
  '총화 시간에 보자우',
];

/** 머리 위 말풍선에 쓰이는 모든 글자. 말풍선을 그리기 전에 이 글자들의 웹 글꼴을 미리 받아 둔다 */
export const BUBBLE_TEXT = `${TAUNTS.join('')}L을 가져가`;

/** 말풍선이 보이기 시작하는 거리(m) */
const TAUNT_RANGE = 34;
/** 이 거리(m) 안으로 들어오면 욕을 자막으로도 한 번 띄운다 */
const SAY_RANGE = 30;

/**
 * 욕 대사를 무작위로 하나 고른다.
 * @author heojeehaeng(claude)
 * @return {string} 욕 대사
 */
export function pickTaunt(): string {
  return TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
}

/**
 * 플레이어가 이번 프레임에 지정한 거리를 지나쳤는지 판정한다.
 * 빠르게 달릴 때 얇은 장애물을 건너뛰지 않도록 직전 프레임 위치까지 함께 본다.
 * @author heojeehaeng(claude)
 * @param {Player} p 플레이어
 * @param {number} d 장애물 거리(m)
 * @param {number} m 앞뒤 여유(m)
 * @return {boolean} 지나쳤는지 여부
 */
function crossed(p: Player, d: number, m: number): boolean {
  return p.d + m >= d && p.prevD - m <= d;
}

/** 점프로 넘는 낮은 장애물, 슬라이드로 지나는 들보, 구멍으로 지나는 철책 */
export class Barrier implements Entity {
  private spent = false;

  /**
   * 장애물을 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 놓을 거리(m)
   * @param {string} kind low(점프), high(슬라이드), gap(구멍 통과)
   * @param {number} x 장애물 중심 또는 구멍 중심 x
   * @param {number} w 장애물 폭 또는 구멍 폭(m)
   * @param {number} color 색상
   */
  constructor(c: Ctx, public d: number, private kind: 'low' | 'high' | 'gap', private x = 0, private w = 8.6, color = 0xd0ab80) {
    const g = new THREE.Group();
    if (kind === 'low') g.add(box(w, 0.5, 0.45, color, x, 0.25, 0));
    else if (kind === 'high') {
      g.add(box(w, 0.4, 0.4, color, x, 1.5, 0));
      g.add(box(0.3, 1.7, 0.3, color, x - w / 2 + 0.15, 0.85, 0), box(0.3, 1.7, 0.3, color, x + w / 2 - 0.15, 0.85, 0));
    } else {
      const fence = new THREE.MeshLambertMaterial({ color: 0xd0d7dc, transparent: true, opacity: 0.6 });
      for (const [a, b] of [[-9, x - w / 2], [x + w / 2, 9]]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(b - a, 2.2, 0.08), fence);
        panel.position.set((a + b) / 2, 1.1, 0);
        g.add(panel, box(b - a, 0.1, 0.14, 0x555b61, (a + b) / 2, 2.25, 0));
        g.add(box(0.14, 2.3, 0.14, 0x555b61, a, 1.15, 0), box(0.14, 2.3, 0.14, 0x555b61, b, 1.15, 0));
      }
    }
    g.position.z = -d;
    c.add(g, d);
  }

  /**
   * 장애물이 차지하는 동작 구역을 반환한다.
   * 길을 다 막은 낮은 장애물은 점프, 들보는 몸 낮추기, 철책 구멍과 한쪽만 막은 장애물은 지나갈 쪽이 정해진 구역이다.
   * @author heojeehaeng(claude)
   * @param {number} d 놓을 거리(m)
   * @param {string} kind low(점프), high(슬라이드), gap(구멍 통과)
   * @param {number} w 장애물 폭 또는 구멍 폭(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number, kind: 'low' | 'high' | 'gap', w = 8.6): Zone {
    const need = kind === 'high' ? 'low' : kind === 'low' && w > 8 ? 'jump' : 'lane';
    return { from: d - 0.4, to: d + 0.4, need };
  }

  update(_dt: number, c: Ctx): void {
    const p = c.player;
    if (this.spent || !crossed(p, this.d, 0.4)) return;
    const dx = Math.abs(p.x - this.x);
    let hit: boolean;
    if (this.kind === 'low') hit = dx < this.w / 2 + 0.25 && p.y < 0.45;
    else if (this.kind === 'high') hit = dx < this.w / 2 + 0.25 && !p.low;
    else hit = dx > this.w / 2 - 0.25;
    // 한 번 걸려 넘어진 장애물은 일어난 뒤 그대로 통과시킨다.
    if (hit && p.fall(FALL_LIGHT)) this.spent = true;
  }

  reset(): void {
    this.spent = false;
  }
}

/** 레일을 따라 마주 굴러오는 광차. 석탄 대신 감자 한 알이 실려 있다 */
export class Cart implements Entity {
  private g = new THREE.Group();
  private d0: number;
  private active = false;
  private spent = false;

  /**
   * 광차를 만들어 레일 위에 놓는다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 처음 놓을 거리(m)
   * @param {number} x 레일 위치 x
   */
  constructor(c: Ctx, public d: number, private x: number) {
    this.d0 = d;
    this.g.add(box(1.3, 0.7, 1.7, 0x8793a0, 0, 0.6, 0), box(1.5, 0.1, 1.9, 0x5c6670, 0, 0.98, 0));
    for (const wx of [-0.55, 0.55]) for (const wz of [-0.6, 0.6]) this.g.add(box(0.12, 0.34, 0.34, 0x1e1e1e, wx, 0.17, wz));
    const potato = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0xc9a66b));
    potato.scale.set(1.3, 0.8, 1);
    potato.position.y = 1.15;
    this.g.add(potato);
    this.g.position.set(x, 0, -d);
    c.add(this.g, d, true);
  }

  update(dt: number, c: Ctx): void {
    const p = c.player;
    if (!this.active && this.d - p.d < 95) this.active = true;
    if (this.active) {
      this.d -= 10 * dt;
      this.g.position.z = -this.d;
    }
    this.g.visible = this.d > p.d - 20 && this.d < p.d + 160;
    if (this.spent) return;
    if (crossed(p, this.d, 1.2) && Math.abs(p.x - this.x) < 0.95 && p.y < 0.85 && p.fall(FALL_LIGHT)) this.spent = true;
  }

  reset(): void {
    this.d = this.d0;
    this.g.position.z = -this.d;
    this.active = this.spent = false;
  }
}

/** 탄광 천장에서 떨어지는 종유석. 떨어진 뒤에는 길 위의 돌덩이로 남는다 */
export class Stalactite implements Entity {
  private rock: THREE.Mesh;
  private mark: THREE.Mesh;
  private state: 'hang' | 'shake' | 'drop' | 'ground' = 'hang';
  private t = 0;
  private vy = 0;
  private y = Stalactite.TOP;
  private lead: number;

  /**
   * 종유석과 바닥의 낙하 예고 표시를 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 떨어질 거리(m)
   * @param {number} x 떨어질 x
   */
  constructor(c: Ctx, public d: number, private x: number) {
    this.rock = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 7), mat(0xc2b6aa));
    this.rock.rotation.x = Math.PI;
    this.rock.position.set(x, this.y, -d);
    this.mark = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), basic(WARN, 0.45));
    this.mark.rotation.x = -Math.PI / 2;
    this.mark.position.set(x, 0.04, -d);
    this.mark.visible = false;
    this.lead = rand(0.85, 1.2);
    c.add(this.rock, d);
    c.add(this.mark, d);
  }

  static TOP = 4.2;

  update(dt: number, c: Ctx): void {
    const p = c.player;
    if (this.state === 'hang') {
      // 플레이어가 도착하기 약 1초 전에 흔들리기 시작해, 발밑이나 바로 앞에 떨어지게 한다.
      if (this.d - p.d < Math.max(p.speed, 8) * this.lead && this.d - p.d > 0) {
        this.state = 'shake';
        this.t = 0.3;
        this.mark.visible = true;
      }
      return;
    }
    if (this.state === 'shake') {
      this.t -= dt;
      this.rock.position.x = this.x + Math.sin(c.time * 70) * 0.08;
      if (this.t <= 0) this.state = 'drop';
    } else if (this.state === 'drop') {
      this.vy -= 34 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0.9) {
        this.y = 0.9;
        this.state = 'ground';
        this.mark.visible = false;
        c.shake(0.15);
      }
      this.rock.position.set(this.x, this.y, -this.d);
    }
    // 떨어지는 중에는 머리 위에서 맞고, 떨어진 뒤에는 점프로 넘을 수 있다.
    const reach = this.state === 'ground' ? p.y < 0.8 : this.y < 2.6;
    if (this.state !== 'shake' && reach && crossed(p, this.d, 0.7) && Math.abs(p.x - this.x) < 0.9) p.fall(FALL_LIGHT);
  }

  reset(): void {
    this.state = 'hang';
    this.y = Stalactite.TOP;
    this.vy = 0;
    this.mark.visible = false;
    this.rock.position.set(this.x, this.y, -this.d);
  }
}

/** 가까이 오면 팔을 벌리고 붙잡는 사람 (탄광의 동료, 시내의 공산당원). 사람마다 움직이는 방식이 다르다 */
export class Grabber implements Entity {
  private g: THREE.Group;
  private x0: number;
  private style: 'chase' | 'lunge' | 'zigzag' | 'block';
  private chase: number;
  /** 겨냥이 빗나가는 정도(m). 가까워질수록 줄어든다 */
  private bias = rand(-1.5, 1.5);
  /** 플레이어를 알아채는 거리(m) */
  private react = rand(16, 38);
  /** 플레이어 쪽으로 걸어오는 속도(m/s) */
  private walk: number;
  private phase = rand(0, 6);
  private rate = rand(2.2, 4.2);
  /** 점프로 넘으려면 발이 이 높이(m)보다 높아야 한다. 점프 한 번에 약 0.5초 동안 넘겨 있다 */
  static CLEAR = 0.6;
  /** 플레이어가 이 거리(m) 안으로 오면 걸어오기 시작한다 */
  static WALK_FROM = 70;
  /** 플레이어가 감시자 앞을 기어서 지나느라 늦어지는 동안 더 걸어 나오는 거리의 여유(m). 시내에서만 쓴다 */
  static CRAWL_LAG = 3.5;

  /**
   * 붙잡는 사람 한 명 또는 한 무리가 차지하는 점프 구역을 반환한다.
   * 걸어오는 사람은 플레이어의 속도에 따라 만나는 자리가 달라지므로 그 범위를 다 덮는다.
   * @author heojeehaeng(claude)
   * @param {number} d 맨 앞사람이 서 있는 거리(m)
   * @param {number} depth 맨 앞사람부터 맨 뒷사람까지의 거리(m)
   * @param {number} walk 걸어오는 속도(m/s)
   * @param {number} lag 앞쪽에 더 두는 여유(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number, depth: number, walk: number, lag = 0): Zone {
    return { from: meet(d, walk, Grabber.WALK_FROM)[0] - 0.6 - lag, to: meet(d + depth, walk, Grabber.WALK_FROM)[1] + 0.6, need: 'jump' };
  }
  private bubble?: THREE.Mesh;
  private said = false;

  /**
   * 붙잡는 사람을 만들어 배치한다. 따라붙기, 덮치기, 좌우로 오가기, 버티고 서기 중 하나를 무작위로 고른다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 서 있는 거리(m)
   * @param {number} x 처음 서 있는 x
   * @param {PersonOpts} look 옷차림
   * @param {string} shout 붙잡았을 때 외치는 말
   * @param {number} chase 옆으로 따라붙는 기본 속도(m/s)
   * @param {boolean} taunt true면 가까이 왔을 때 외치는 말을 머리 위 말풍선으로도 보여 준다
   * @param {number} walk 플레이어 쪽으로 걸어오는 속도(m/s). 0이면 제자리에 서 있는다. 무리 지어 선 사람들은 같은 값을 줘서 서로의 간격이 달라지지 않게 한다
   */
  constructor(
    c: Ctx, public d: number, private x: number, look: PersonOpts, private shout: string, chase = 5, taunt = false, walk = 0,
  ) {
    this.walk = walk;
    this.x0 = x;
    this.chase = chase * rand(0.7, 1.25);
    const r = Math.random();
    this.style = r < 0.38 ? 'chase' : r < 0.6 ? 'lunge' : r < 0.84 ? 'zigzag' : 'block';
    this.g = makePerson(look);
    this.g.rotation.y = Math.PI;
    this.g.position.set(x, 0, -d);
    if (taunt) {
      this.bubble = makeBubble(shout);
      this.bubble.position.y = 2.2;
      // 몸이 뒤로 돌아서 있으므로 말풍선은 다시 돌려 글자가 플레이어 쪽을 향하게 한다.
      this.bubble.rotation.y = Math.PI;
      this.bubble.visible = false;
      this.g.add(this.bubble);
    }
    c.add(this.g, d);
  }

  update(dt: number, c: Ctx): void {
    const p = c.player;
    if (this.walk && this.d - p.d < Grabber.WALK_FROM && this.d - p.d > 2) this.d -= this.walk * dt;
    const dd = this.d - p.d;
    if (this.bubble) {
      this.bubble.visible = dd < TAUNT_RANGE && dd > -2;
      if (!this.said && dd < SAY_RANGE && dd > 0) {
        this.said = true;
        c.say(this.shout);
      }
    }
    const near = dd < this.react && dd > -1;
    if (near) {
      let target = this.x;
      let speed = this.chase;
      if (this.style === 'chase') target = p.x + this.bias * Math.min(1, dd / 14);
      else if (this.style === 'lunge') {
        // 가만히 서 있다가 코앞에서 갑자기 옆으로 덮친다.
        if (dd < 11) {
          target = p.x;
          speed = 10;
        }
      } else if (this.style === 'zigzag') {
        target = Math.max(-3.4, Math.min(3.4, this.x0 + Math.sin(c.time * this.rate + this.phase) * 2.8));
        speed = 7;
      }
      const gap = target - this.x;
      this.x += Math.sign(gap) * Math.min(speed * dt, Math.abs(gap));
      swingPerson(this.g, c.time * 14, 0.5);
    }
    this.g.position.set(this.x, 0, -this.d);
    const { armL, armR, elbowL, elbowR } = this.g.userData.parts;
    // 붙잡기 직전에 팔을 옆으로 벌려 예고한다. 버티고 서는 사람은 처음부터 벌리고 있다.
    armL.rotation.z = armR.rotation.z = 0;
    if ((near && dd < 20) || (this.style === 'block' && dd < 60)) {
      armL.rotation.x = armR.rotation.x = 0;
      armL.rotation.z = -1.4;
      armR.rotation.z = 1.4;
      // 벌린 팔 끝을 앞으로 살짝 굽혀 끌어안으려는 자세를 만든다.
      elbowL.rotation.x = elbowR.rotation.x = 0.45;
    }
    const reach = this.style === 'block' ? 1.35 : 0.8;
    // 점프하면 벌린 팔 위로 넘어간다. 발이 이 높이보다 낮을 때만 붙잡힌다.
    if (crossed(p, this.d, 0.6) && Math.abs(p.x - this.x) < reach && p.y < Grabber.CLEAR && p.fall(FALL_LIGHT)) c.toast(this.shout);
  }
}

/** 큼직한 휴대폰만 들여다보며 앞을 보지 않고 걷는 군인. 부딪히면 넘어진다 */
export class PhoneWalker implements Entity {
  private g: THREE.Group;
  private phase = rand(0, 6);
  private x = 0;

  /**
   * 휴대폰을 보며 걷는 군인을 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 처음 서 있는 거리(m)
   * @param {number} sway 좌우로 비틀거리는 폭(m)
   */
  constructor(c: Ctx, public d: number, private sway: number) {
    this.g = makePerson({ shirt: 0x5c6a44, pants: 0x4a5638, hat: 0x4a5638, camo: true, boots: true, face: 'smile' });
    this.g.rotation.y = Math.PI;
    // 얼굴 앞에 든 큼직한 휴대폰. 플레이어 쪽으로는 뒷면과 카메라 렌즈가 보인다.
    const phone = new THREE.Group();
    phone.add(box(0.46, 0.8, 0.06, 0x15171c, 0, 0, 0));
    phone.add(box(0.16, 0.16, 0.03, 0x2b2f38, 0.11, 0.26, -0.04), box(0.06, 0.06, 0.02, 0x7fb6ff, 0.11, 0.26, -0.06));
    // 화면 불빛이 휴대폰 둘레로 새어 나와 얼굴을 비춘다.
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.96), basic(0x9fd4ff, 0.75));
    glow.position.z = 0.04;
    phone.add(glow);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.72),
      new THREE.MeshBasicMaterial({ map: textTexture('ㅋㅋㅋ\n♥ 좋아요', 128, 230, '#eaf6ff', '#2a6fd6') }),
    );
    screen.position.z = 0.045;
    phone.add(screen);
    phone.position.set(0, 1.42, -0.62);
    phone.rotation.x = 0.25;
    this.g.add(phone);
    // 이어폰 줄
    this.g.add(box(0.02, 0.5, 0.02, 0xffffff, -0.3, 1.2, -0.25), box(0.02, 0.5, 0.02, 0xffffff, 0.3, 1.2, -0.25));
    const bubble = makeSign('ㅋㅋㅋ', 0.9, 0.42, '#ffffff', '#222222', 0);
    bubble.position.set(0.5, 2.15, 0);
    bubble.rotation.y = Math.PI;
    this.g.add(bubble);
    // 플레이어가 가까이 와서 갱신이 시작되기 전에는 출발선(원점)에 서 있지 않도록 제자리에 숨겨 둔다.
    this.g.position.set(0, 0, -d);
    this.g.visible = false;
    c.add(this.g, d, true);
  }

  /**
   * 휴대폰 보는 군인과 마주치는 구역을 반환한다.
   * @author heojeehaeng(claude)
   * @param {number} d 처음 서 있는 거리(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number): Zone {
    const [near, far] = meet(d, 2.2, 120);
    return { from: near - 0.6, to: far + 0.6, need: 'sweep' };
  }

  update(dt: number, c: Ctx): void {
    const p = c.player;
    // 앞을 보지 않으므로 플레이어를 따라오지 않고 제멋대로 비틀거리며 걸어온다.
    if (this.d - p.d < 120) this.d -= 2.2 * dt;
    this.x = Math.sin(c.time * 0.9 + this.phase) * this.sway;
    this.g.position.set(this.x, 0, -this.d);
    this.g.visible = this.d > p.d - 20 && this.d < p.d + 190;
    swingPerson(this.g, c.time * 6, 0.4);
    // 두 팔은 휴대폰을 든 자세로 고정한다.
    const { armL, armR, elbowL, elbowR } = this.g.userData.parts;
    armL.rotation.x = armR.rotation.x = 1.3;
    armL.rotation.z = -0.35;
    armR.rotation.z = 0.35;
    elbowL.rotation.x = elbowR.rotation.x = 1.1;
    if (crossed(p, this.d, 0.6) && Math.abs(p.x - this.x) < 0.8 && p.y < 1.2 && p.fall(FALL_LIGHT)) c.toast('"아, 죄송합니다"');
  }
}

/** 이마 앞에 손가락으로 L자를 만들고 좌우로 뛰며 약 올리는 춤을 추는 병사. 부딪히면 넘어진다 */
export class LDancer implements Entity {
  private g: THREE.Group;
  private phase = rand(0, 6);
  private said = false;
  x = 0;

  /**
   * 약 올리는 춤을 추는 병사를 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 춤추는 거리(m)
   * @param {number} cx 춤추는 자리의 가운데 x
   * @param {number} span 좌우로 뛰어다니는 폭(m)
   * @param {number} beat 춤 박자의 빠르기(rad/s)
   */
  constructor(c: Ctx, public d: number, private cx: number, private span: number, private beat: number) {
    this.g = makePerson({ shirt: 0x5c6a44, pants: 0x4a5638, hat: 0x4a5638, camo: true, boots: true, face: 'grin' });
    this.g.rotation.y = Math.PI;
    // 오른손에 흰 장갑을 끼고 검지와 엄지로 L자를 만든다. 멀리서도 보이도록 손보다 크게 그린다.
    const { armR } = this.g.userData.parts;
    armR.add(box(0.2, 0.2, 0.16, 0xffffff, 0, -0.5, 0), box(0.09, 0.34, 0.09, 0xffffff, 0.05, -0.74, 0), box(0.26, 0.09, 0.09, 0xffffff, -0.17, -0.48, 0));
    const bubble = makeBubble('L을 가져가');
    bubble.position.y = 2.35;
    // 몸이 뒤로 돌아서 있으므로 말풍선은 다시 돌려 글자가 플레이어 쪽을 향하게 한다.
    bubble.rotation.y = Math.PI;
    this.g.add(bubble);
    // 플레이어가 가까이 와서 갱신이 시작되기 전에는 출발선(원점)에 서 있지 않도록 제자리에 숨겨 둔다.
    this.g.position.set(cx, 0, -d);
    this.g.visible = false;
    c.add(this.g, d, true);
  }

  /**
   * 춤추는 병사가 길을 쓸고 다니는 구역을 반환한다.
   * @author heojeehaeng(claude)
   * @param {number} d 춤추는 거리(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number): Zone {
    return { from: d - 0.6, to: d + 0.6, need: 'sweep' };
  }

  update(_dt: number, c: Ctx): void {
    const p = c.player;
    const dd = this.d - p.d;
    this.g.visible = dd > -20 && dd < 190;
    const t = c.time * this.beat + this.phase;
    // 한 박자에 한 번씩 폴짝 뛰면서 좌우로 오간다.
    this.x = Math.max(-ROAD_HALF + 0.3, Math.min(ROAD_HALF - 0.3, this.cx + Math.sin(t) * this.span));
    const kick = Math.sin(t * 2);
    this.g.position.set(this.x, Math.abs(kick) * 0.22, -this.d);
    this.g.rotation.z = Math.sin(t) * 0.2;
    const { legL, legR, armL, armR, kneeL, kneeR, elbowL } = this.g.userData.parts;
    legL.rotation.x = Math.max(0, kick) * 1.2;
    legR.rotation.x = Math.max(0, -kick) * 1.2;
    // 들어 올린 다리는 무릎을 접어 폴짝 뛰는 모양을 만든다.
    kneeL.rotation.x = -Math.max(0, kick) * 1.5;
    kneeR.rotation.x = -Math.max(0, -kick) * 1.5;
    elbowL.rotation.x = 0.9;
    armL.rotation.set(kick * 0.9, 0, -0.5);
    // L자를 만든 손은 이마 앞에 고정하고 박자에 맞춰 까딱인다.
    armR.rotation.set(2.75, 0, 0.2 + kick * 0.08);
    if (!this.said && dd < SAY_RANGE && dd > 0) {
      this.said = true;
      c.say('L을 가져가~');
    }
    if (crossed(p, this.d, 0.6) && Math.abs(p.x - this.x) < 0.85 && p.y < 1.0 && p.fall(FALL_LIGHT)) c.toast('"L을 가져가!"');
  }
}

/** 러닝머신 위에서 제자리걸음하는 행진 대열. 이 안에 섞이면 감시자에게 보이지 않는다 */
export class Crowd implements Entity {
  order = 0;
  d: number;
  private people: THREE.Group[] = [];

  /**
   * 행진 대열을 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d0 대열이 시작되는 거리(m)
   * @param {number} d1 대열이 끝나는 거리(m)
   * @param {number} x 대열 중심 x
   */
  constructor(c: Ctx, private d0: number, private d1: number, private x: number) {
    this.d = (d0 + d1) / 2;
    for (let d = d0 + 1; d < d1; d += 3.2) {
      for (const ox of [-1.5, 0, 1.5]) {
        const p = makePerson({ shirt: 0xd9d2b4, pants: 0xb9b294, hat: 0xd9d2b4, back: true });
        p.position.set(x + ox, 0.08, -d);
        this.people.push(p);
        c.add(p, d);
        c.add(box(0.9, 0.08, 1.4, 0x2b2b2b, x + ox, 0.04, -d), d);
      }
    }
  }

  /**
   * 행진 대열이 차지하는 구역을 반환한다. 옆의 감시자 때문에 대열에 섞이거나 기어서 지나야 하므로 감시자 시야와 같은 구역으로 본다.
   * @author heojeehaeng(claude)
   * @param {number} d0 대열이 시작되는 거리(m)
   * @param {number} d1 대열이 끝나는 거리(m)
   * @return {Zone} 동작 구역
   */
  static zone(d0: number, d1: number): Zone {
    return { from: d0, to: d1, need: 'crawl' };
  }

  update(_dt: number, c: Ctx): void {
    const p = c.player;
    if (p.d > this.d0 && p.d < this.d1 && Math.abs(p.x - this.x) < 2.3) c.inCrowd = true;
    this.people.forEach((m, i) => swingPerson(m, c.time * 7 + (i % 3), 0.8));
  }
}

/** 고개를 좌우로 돌리며 부채꼴 시야로 감시하는 공산당원. 시야에 닿으면 바로 발각된다 */
export class Watcher implements Entity {
  private pivot = new THREE.Group();
  private man: THREE.Group;
  private base: number;
  private wx: number;

  /**
   * 감시자와 바닥의 부채꼴 시야를 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 서 있는 거리(m)
   * @param {number} side -1이면 길 왼쪽, 1이면 오른쪽
   * @param {number} phase 고개 돌리는 박자 위상(rad)
   * @param {number} range 시야 거리(m)
   * @param {number} rate 고개 돌리는 빠르기(rad/s)
   * @param {string} taunt 머리 위 말풍선에 띄울 욕. 없으면 말풍선을 만들지 않는다
   */
  constructor(c: Ctx, public d: number, side: number, private phase: number, private range = 10, private rate = 1.3, private taunt?: string) {
    this.wx = side * 5.2;
    // 시야 기본 방향은 길 안쪽이면서 달려오는 플레이어 쪽(+z)이다.
    this.base = side < 0 ? -0.6 : Math.PI + 0.6;
    const cone = new THREE.Mesh(new THREE.CircleGeometry(range, 20, -Watcher.HALF, Watcher.HALF * 2), basic(WARN, 0.34));
    cone.rotation.x = -Math.PI / 2;
    cone.position.y = 0.05;
    this.pivot.add(cone);
    this.pivot.position.set(this.wx, 0, -d);
    this.man = makePerson({ shirt: 0x3b3550, pants: 0x2a2639, hat: 0xa82a44, hatKind: 'officer', boots: true, face: 'angry', armband: 0xc0261c });
    this.man.position.set(this.wx, 0, -d);
    c.add(this.pivot, d);
    c.add(this.man, d);
    c.add(box(1.1, 0.25, 1.1, 0x777777, this.wx, 0.02, -d), d);
    if (taunt) {
      this.bubble = makeBubble(taunt);
      this.bubble.position.set(this.wx, 2.3, -d);
      this.bubble.visible = false;
      c.add(this.bubble, d);
    }
  }

  static HALF = 0.4;
  private bubble?: THREE.Mesh;
  private said = false;

  /**
   * 감시자의 시야가 길 위에 닿는 구역을 반환한다. 시야는 달려오는 쪽으로 시야 거리만큼, 지나간 쪽으로는 그 0.6배까지 닿는다.
   * @author heojeehaeng(claude)
   * @param {number} d 서 있는 거리(m)
   * @param {number} range 시야 거리(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number, range: number): Zone {
    return { from: d - range, to: d + range * 0.6, need: 'crawl' };
  }

  update(_dt: number, c: Ctx): void {
    const p = c.player;
    if (this.bubble && this.taunt) {
      const dd = this.d - p.d;
      this.bubble.visible = dd < TAUNT_RANGE && dd > -2;
      if (!this.said && dd < SAY_RANGE && dd > 0) {
        this.said = true;
        c.say(this.taunt);
      }
    }
    const a = this.base + Math.sin(c.time * this.rate + this.phase) * 0.75;
    this.pivot.rotation.y = a;
    // 사람 모델은 -z를 보므로 시야 방향과 맞추려면 90도를 빼서 돌린다.
    this.man.rotation.y = a - Math.PI / 2;
    const rx = p.x - this.wx;
    const rz = -p.d + this.d;
    const dist = Math.hypot(rx, rz);
    // 넘어져 있는 동안에는 기어서 피할 방법이 없으므로 발각하지 않는다.
    if (dist > this.range || p.hiding || c.inCrowd || p.state === 'fall') return;
    let diff = Math.atan2(-rz, rx) - a;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) < Watcher.HALF) c.detect('발각!');
  }
}

/** 붉은 조준선을 보여 준 뒤 총을 쏘는 사람 (DMZ의 북한군, 시내의 공산당원) */
export class Shooter implements Entity {
  private man: THREE.Group;
  private line: THREE.Mesh;
  private ring: THREE.Mesh;
  private t = 0.4;
  private aiming = false;
  private tx = 0;
  private td = 0;
  private sx: number;

  /**
   * 총 쏘는 사람과 조준선을 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 서 있는 거리(m)
   * @param {number} side -1이면 길 왼쪽, 1이면 오른쪽
   * @param {PersonOpts} look 옷차림
   * @param {number} cooldown 다음 조준까지 쉬는 시간(초)
   * @param {string} taunt 머리 위 말풍선에 띄울 욕. 없으면 말풍선을 만들지 않는다
   */
  constructor(c: Ctx, public d: number, side: number, look: PersonOpts, private cooldown = 1.2, private taunt?: string) {
    this.sx = side * 5.6;
    this.man = makePerson(look);
    this.man.position.set(this.sx, 0, -d);
    this.man.add(box(0.08, 0.08, 1.0, 0x222222, 0.3, 1.05, -0.5));
    this.line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 1), basic(WARN, 0.85));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 20), basic(WARN, 0.85));
    this.ring.rotation.x = -Math.PI / 2;
    this.line.visible = this.ring.visible = false;
    c.add(this.man, d);
    c.add(this.line, d, true);
    c.add(this.ring, d, true);
    if (taunt) {
      this.bubble = makeBubble(taunt);
      this.bubble.position.set(this.sx, 2.3, -d);
      this.bubble.visible = false;
      c.add(this.bubble, d);
    }
  }

  static AIM = 0.9;
  private bubble?: THREE.Mesh;
  private said = false;

  update(dt: number, c: Ctx): void {
    const p = c.player;
    const dd = this.d - p.d;
    if (this.bubble && this.taunt) {
      this.bubble.visible = dd < TAUNT_RANGE && dd > -2;
      if (!this.said && dd < SAY_RANGE && dd > 0) {
        this.said = true;
        c.say(this.taunt);
      }
    }
    const inRange = dd < 70 && dd > -22 && p.state === 'run';
    this.t -= dt;
    if (!this.aiming) {
      if (inRange && this.t <= 0) {
        this.aiming = true;
        this.t = Shooter.AIM;
        // 조준이 끝날 때 플레이어가 있을 자리를 겨눈다. 그대로 달리면 맞는다.
        this.tx = p.x;
        this.td = p.d + Math.max(p.speed, 6) * Shooter.AIM;
        this.aim();
      }
      return;
    }
    (this.line.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.4 * Math.sin(c.time * 30);
    if (this.t > 0) return;
    this.aiming = false;
    this.t = this.cooldown;
    this.line.visible = this.ring.visible = false;
    if (Math.abs(p.x - this.tx) < 0.8 && Math.abs(p.d - this.td) < 2.4 && !p.low && p.y < 1.2 && p.fall(FALL_HEAVY)) {
      c.toast('탕!');
      c.shake(0.3);
    }
  }

  /**
   * 조준선과 표적 고리를 겨눈 자리에 맞춰 놓는다.
   * @author heojeehaeng(claude)
   */
  private aim(): void {
    const from = new THREE.Vector3(this.sx, 0.06, -this.d);
    const to = new THREE.Vector3(this.tx, 0.06, -this.td);
    this.line.position.copy(from).add(to).multiplyScalar(0.5);
    this.line.lookAt(to);
    this.line.scale.z = from.distanceTo(to);
    this.ring.position.copy(to);
    this.line.visible = this.ring.visible = true;
    // lookAt은 +z를 표적으로 돌리는데 사람 모델은 -z를 보므로 반 바퀴 더 돌린다.
    this.man.lookAt(this.tx, 0, -this.td);
    this.man.rotateY(Math.PI);
  }

  reset(): void {
    this.aiming = false;
    this.t = 0.4;
    this.line.visible = this.ring.visible = false;
  }
}

/** 밟으면 터져 하늘로 날려 보내는 지뢰 */
export class Mine implements Entity {
  private g = new THREE.Group();
  private boom: THREE.Mesh;
  private spent = false;
  private boomT = 0;

  /**
   * 지뢰를 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 놓을 거리(m)
   * @param {number} x 놓을 x
   * @param {boolean} flag true면 붉은 깃발로 표시한다
   */
  constructor(c: Ctx, public d: number, private x: number, flag: boolean) {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat(0x3a2f27));
    mound.scale.y = 0.35;
    this.g.add(mound, box(0.2, 0.08, 0.2, 0x222222, 0, 0.18, 0));
    // 흙길과 색이 비슷해 빠르게 달릴 때 보이지 않으므로, 둘레에 파헤친 흙 자국을 어둡게 깐다.
    const scar = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.85, 14), new THREE.MeshBasicMaterial({ color: 0x2a211b }));
    scar.rotation.x = -Math.PI / 2;
    scar.position.y = 0.03;
    this.g.add(scar);
    if (flag) this.g.add(box(0.04, 0.9, 0.04, 0xdddddd, 0.3, 0.45, 0), box(0.35, 0.22, 0.03, WARN, 0.48, 0.78, 0));
    this.g.position.set(x, 0, -d);
    this.boom = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), basic(0xffb020, 0.8));
    this.boom.position.set(x, 0.4, -d);
    this.boom.visible = false;
    c.add(this.g, d);
    c.add(this.boom, d);
  }

  update(dt: number, c: Ctx): void {
    if (this.boomT > 0) {
      this.boomT -= dt;
      this.boom.scale.setScalar(1 + (0.35 - this.boomT) * 9);
      this.boom.visible = this.boomT > 0;
    }
    const p = c.player;
    if (this.spent || !crossed(p, this.d, 0.6) || Math.abs(p.x - this.x) > 0.6 || p.y > 0.2) return;
    if (!p.fall(FALL_HEAVY, true)) return;
    this.spent = true;
    this.g.visible = false;
    this.boomT = 0.35;
    c.shake(0.6);
    c.toast('펑!');
  }

  reset(): void {
    this.spent = false;
    this.g.visible = true;
  }
}

/** 앞발을 벌린 채 따라붙어 베어허그로 끌어안는 곰 */
export class Bear implements Entity {
  private g = makeBear();
  private d0: number;
  private x0: number;
  private hugT = 0;

  /**
   * 곰을 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 서 있는 거리(m)
   * @param {number} x 서 있는 x
   */
  constructor(c: Ctx, public d: number, private x: number) {
    this.d0 = d;
    this.x0 = x;
    this.g.position.set(x, 0, -d);
    c.add(this.g, d, true);
  }

  /**
   * 곰과 마주치는 구역을 반환한다. 곰은 가까워지면 덮쳐 오므로 서 있던 자리보다 앞에서 만난다.
   * @author heojeehaeng(claude)
   * @param {number} d 서 있는 거리(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number): Zone {
    const [near, far] = meet(d, 6, 22);
    // 슬라이드로 빨라진 채 들어오면 조금 더 뒤에서 만나므로 뒤쪽 여유를 1m 더 둔다.
    return { from: near - 1.6, to: far + 2.6, need: 'low' };
  }

  update(dt: number, c: Ctx): void {
    const p = c.player;
    const dd = this.d - p.d;
    const alert = dd < 55 && dd > -3;
    this.g.visible = dd > -25 && dd < 180;
    // 가까워지면 몸을 일으켜 다리 사이 틈이 더 크게 보이게 한다.
    this.g.scale.setScalar(this.g.scale.x + ((alert ? 1.15 : 0.92) - this.g.scale.x) * Math.min(1, dt * 8));
    (this.g.userData.arms as THREE.Group).visible = alert || this.hugT > 0;
    const guide = this.g.userData.guide as THREE.Mesh;
    guide.visible = alert && this.hugT <= 0;
    // 바닥 화살표가 다리 사이를 향해 흐르게 한다.
    (guide.material as THREE.MeshBasicMaterial).map!.offset.y = 1 - ((c.time * 1.4) % 1);
    if (this.hugT > 0) {
      // 끌어안은 동안에는 곰이 플레이어를 붙든 채 좌우로 흔든다.
      this.hugT -= dt;
      this.g.rotation.z = Math.sin(c.time * 25) * 0.12;
      return;
    }
    this.g.rotation.z = 0;
    if (alert && p.state === 'run') {
      // 옆으로 따라붙다가 가까워지면 플레이어 쪽으로 덮쳐 온다.
      const gap = p.x - this.x;
      this.x += Math.sign(gap) * Math.min(5.5 * dt, Math.abs(gap));
      if (dd < 22) this.d -= 6 * dt;
    }
    this.g.position.set(this.x, 0, -this.d);
    // 슬라이드하거나 엎드리면 벌린 다리 사이로 빠져나간다.
    if (!p.low && crossed(p, this.d, 1.6) && Math.abs(p.x - this.x) < 2.3 && p.y < 1.6 && p.fall(FALL_HEAVY)) {
      this.hugT = FALL_HEAVY * 0.8;
      c.animalHit();
      c.shake(0.4);
      c.toast('베어허그!');
    }
  }

  reset(): void {
    this.d = this.d0;
    this.x = this.x0;
    this.hugT = 0;
    this.g.position.set(this.x, 0, -this.d);
  }
}

/** 울음소리를 낸 뒤 길을 이리저리 가로지르며 돌진하는 동물 (호랑이, 고양이) */
export class Dasher implements Entity {
  private state: 'wait' | 'roar' | 'run' | 'done' = 'wait';
  private t = 0;
  private x = 0;
  private dNow = 0;
  private fromX = 0;
  private fromD = 0;
  private toX = 0;
  private toD = 0;
  private k = 0;
  private legs = 0;
  private legSpeed = 0;
  private pause = 0;
  private flyer?: THREE.Group;

  /**
   * 돌진하는 동물을 길옆에 배치한다. 달리는 궤적, 빠르기, 멈칫하는 순간은 매번 무작위로 정한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 가로지르는 중심 거리(m)
   * @param {THREE.Group} g 동물 모델. 머리는 +x 방향이어야 한다
   * @param {number} speed 달리는 기본 속도(m/s)
   * @param {number} reach 부딪히는 좌우 범위(m)
   * @param {number} height 이 높이(m)보다 높이 뛰면 넘어간다
   * @param {string} cry 나타날 때 우는 소리
   * @param {string} hitMsg 부딪혔을 때 문구
   */
  constructor(
    c: Ctx, public d: number, private g: THREE.Group, private speed: number,
    private reach: number, private height: number, private cry: string, private hitMsg: string,
  ) {
    this.flyer = g.userData.magpie;
    this.x = Math.random() < 0.5 ? -7.5 : 7.5;
    this.dNow = this.d + rand(-3, 3);
    this.g.position.set(this.x, 0, -this.dNow);
    this.g.rotation.set(0, this.x < 0 ? 0 : Math.PI, 0);
    c.add(this.g, d, true);
  }

  /** 중심 거리에서 앞뒤로 돌아다니는 범위(m) */
  static ROAM = 14;

  /**
   * 돌진하는 동물이 길을 가로지르며 돌아다니는 구역을 반환한다.
   * @author heojeehaeng(claude)
   * @param {number} d 가로지르는 중심 거리(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number): Zone {
    return { from: d - Dasher.ROAM - 1.5, to: d + Dasher.ROAM + 1.5, need: 'pounce' };
  }

  /**
   * 다음에 달려갈 지점과 빠르기를 정한다.
   * 반대편까지 가로지르기, 길 가운데에서 꺾기, 왔던 쪽으로 되돌아가기를 무작위로 섞는다.
   * @author heojeehaeng(claude)
   * @param {number} pd 플레이어가 달린 거리(m)
   */
  private nextLeg(pd: number): void {
    this.fromX = this.x;
    this.fromD = this.dNow;
    const far = this.x < 0 ? 7.5 : -7.5;
    const r = Math.random();
    if (r < 0.45) this.toX = far;
    else if (r < 0.8) this.toX = rand(-3.4, 3.4);
    else this.toX = -far * rand(0.3, 1);
    // 플레이어가 지나갈 자리 근처를 가로지르도록 목표 거리를 플레이어 앞쪽으로 잡는다.
    this.toD = Math.max(this.d - Dasher.ROAM, Math.min(this.d + Dasher.ROAM, pd + rand(3, 24)));
    this.legSpeed = this.speed * rand(0.85, 1.5);
    // 가끔 멈칫했다가 튀어 나가 박자를 읽기 어렵게 한다.
    this.pause = Math.random() < 0.25 ? rand(0.08, 0.22) : 0;
    this.k = 0;
    this.legs--;
  }

  update(dt: number, c: Ctx): void {
    const p = c.player;
    this.g.visible = this.d > p.d - 30 && this.d < p.d + 200;
    if (this.flyer) this.flyer.position.y = 2.1 + Math.sin(c.time * 9) * 0.15;
    if (this.state === 'wait') {
      if (this.d - p.d < Math.max(p.speed, 8) * 1.5 + 8 && this.d - p.d > 0) {
        this.state = 'roar';
        this.t = 0.4;
        this.legs = 5 + Math.floor(Math.random() * 4);
        c.toast(this.cry);
        c.shake(0.2);
      }
      return;
    }
    if (this.state === 'roar') {
      this.t -= dt;
      this.g.rotation.z = Math.sin(c.time * 40) * 0.06;
      if (this.t <= 0) {
        this.g.rotation.z = 0;
        this.state = 'run';
        this.nextLeg(p.d);
      }
      return;
    }
    if (this.state === 'done') return;
    if (this.pause > 0) {
      this.pause -= dt;
      this.g.scale.y = 0.75;
    } else {
      this.g.scale.y = 1;
      const len = Math.hypot(this.toX - this.fromX, this.toD - this.fromD) || 1;
      this.k += (this.legSpeed * dt) / len;
      const k = Math.min(1, this.k);
      this.x = this.fromX + (this.toX - this.fromX) * k;
      this.dNow = this.fromD + (this.toD - this.fromD) * k;
      this.g.position.set(this.x, 0, -this.dNow);
      this.g.rotation.y = Math.atan2(this.toD - this.fromD, this.toX - this.fromX);
      runQuad(this.g, c.time * 26);
      if (this.k >= 1) {
        if (this.legs > 0 && this.dNow > p.d - 6) this.nextLeg(p.d);
        else this.state = 'done';
      }
    }
    if (crossed(p, this.dNow, 1.2) && Math.abs(p.x - this.x) < this.reach && p.y < this.height && p.fall(FALL_HEAVY)) {
      c.animalHit();
      c.toast(this.hitMsg);
    }
  }
}

/**
 * 호랑이를 만든다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @param {number} d 가로지르는 중심 거리(m)
 * @return {Dasher} 호랑이
 */
export function makeTigerEnemy(c: Ctx, d: number): Dasher {
  return new Dasher(c, d, makeTiger(), 30, 1.3, 0.75, '어흥!', '호랑이에게 치였다!');
}

/**
 * 고양이를 만든다. 효과는 호랑이와 같고 속도는 호랑이의 1.5배다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @param {number} d 가로지르는 중심 거리(m)
 * @return {Dasher} 고양이
 */
export function makeCatEnemy(c: Ctx, d: number): Dasher {
  return new Dasher(c, d, makeCat(), 45, 0.8, 0.5, '야옹!', '고양이에게 걸려 넘어졌다!');
}

/** 리용길을 향해 빠르게 달려와 들이받는 동물 (고라니, 멧돼지) */
export class Charger implements Entity {
  private state: 'wait' | 'run' | 'done' = 'wait';
  private x: number;
  private dNow: number;
  private vx = 0;
  private vd = 0;

  /**
   * 달려오는 동물을 길 앞쪽에 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 처음 서 있는 거리(m)
   * @param {number} x0 처음 서 있는 x
   * @param {THREE.Group} g 동물 모델. 머리는 +z 방향이어야 한다
   * @param {number} speed 달리는 속도(m/s)
   * @param {number} turn 달리는 중에 플레이어 쪽으로 방향을 트는 빠르기(rad/s). 0이면 직선으로만 달린다
   * @param {number} reach 부딪히는 좌우 범위(m)
   * @param {string} cry 나타날 때 문구
   * @param {string} hitMsg 부딪혔을 때 문구
   */
  constructor(
    c: Ctx, public d: number, x0: number, private g: THREE.Group, private speed: number,
    private turn: number, private reach: number, private cry: string, private hitMsg: string,
  ) {
    this.x = x0;
    this.dNow = d;
    this.g.position.set(this.x, 0, -this.dNow);
    c.add(this.g, d, true);
  }

  update(dt: number, c: Ctx): void {
    const p = c.player;
    this.g.visible = this.dNow > p.d - 25 && this.dNow < p.d + 200;
    if (this.state === 'done') return;
    if (this.state === 'wait') {
      const dd = this.d - p.d;
      if (dd > 100 || dd < 0 || p.state !== 'run') return;
      // 출발하는 순간 플레이어와 마주칠 자리를 향해 방향을 정한다.
      const t = dd / (this.speed + Math.max(p.speed, 8));
      const dx = p.x - this.x;
      const ddist = p.d + p.speed * t - this.dNow;
      const len = Math.hypot(dx, ddist) || 1;
      this.vx = (dx / len) * this.speed;
      this.vd = (ddist / len) * this.speed;
      this.state = 'run';
      c.toast(this.cry, 0.8);
    }
    if (this.turn > 0 && this.dNow > p.d + 4) {
      // 달리는 방향을 플레이어 쪽으로 조금씩 튼다. 급하게 꺾지는 못한다.
      const want = Math.atan2(p.x - this.x, p.d - this.dNow);
      const now = Math.atan2(this.vx, this.vd);
      let diff = Math.atan2(Math.sin(want - now), Math.cos(want - now));
      diff = Math.max(-this.turn * dt, Math.min(this.turn * dt, diff));
      this.vx = Math.sin(now + diff) * this.speed;
      this.vd = Math.cos(now + diff) * this.speed;
    }
    this.x += this.vx * dt;
    this.dNow += this.vd * dt;
    this.g.rotation.y = Math.atan2(this.vx, -this.vd);
    this.g.position.set(this.x, Math.abs(Math.sin(c.time * 22)) * 0.2, -this.dNow);
    runQuad(this.g, c.time * 24);
    if (this.dNow < p.d - 20) this.state = 'done';
    if (crossed(p, this.dNow, 1.5) && Math.abs(p.x - this.x) < this.reach && p.y < 0.9 && p.fall(FALL_HEAVY)) {
      c.animalHit();
      c.shake(0.3);
      c.toast(this.hitMsg);
    }
  }
}

/**
 * 고라니를 만든다. 리용길을 향해 직선으로 달려온다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @param {number} d 처음 서 있는 거리(m)
 * @param {number} x 처음 서 있는 x
 * @return {Charger} 고라니
 */
export function makeDeerEnemy(c: Ctx, d: number, x: number): Charger {
  return new Charger(c, d, x, makeDeer(), 30, 0, 0.9, '고라니다!', '고라니에게 들이받혔다!');
}

/**
 * 멧돼지를 만든다. 고라니보다 느리지만 달리면서 플레이어 쪽으로 방향을 튼다.
 * @author heojeehaeng(claude)
 * @param {Ctx} c 게임 창구
 * @param {number} d 처음 서 있는 거리(m)
 * @param {number} x 처음 서 있는 x
 * @return {Charger} 멧돼지
 */
export function makeBoarEnemy(c: Ctx, d: number, x: number): Charger {
  return new Charger(c, d, x, makeBoar(), 24, 1.1, 1.1, '멧돼지다!', '멧돼지에게 들이받혔다!');
}

/** 목을 360도로 휘두르는 기린. 휘두르는 방향과 빠르기, 궤적은 매번 무작위다. 슬라이드로 지나간다 */
export class Giraffe implements Entity {
  private g: THREE.Group;
  private neck: THREE.Group;
  private gx: number;
  private rest: number;
  private a: number;
  private state: 'rest' | 'wind' | 'swing' = 'rest';
  private t = rand(0.2, 0.8);
  private dir = 1;
  private rate = 5;
  private left = 0;

  /**
   * 기린을 만들어 길옆에 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 서 있는 거리(m)
   * @param {number} side -1이면 길 왼쪽, 1이면 오른쪽
   */
  constructor(c: Ctx, public d: number, side: number) {
    this.g = makeGiraffe(Giraffe.LEN);
    this.neck = this.g.userData.neck;
    this.gx = side * 5.6;
    this.g.position.set(this.gx, 0, -d);
    // 쉴 때는 목이 길 바깥쪽을 향한다.
    this.rest = side < 0 ? Math.PI : 0;
    this.a = this.rest;
    this.neck.rotation.y = this.a;
    c.add(this.g, d);
  }

  static LEN = 9.5;
  /** 처음 만든 것보다 2.2배 빠르게 휘두른다 */
  static FAST = 2.2;

  /**
   * 기린의 목이 닿는 구역을 반환한다.
   * @author heojeehaeng(claude)
   * @param {number} d 서 있는 거리(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number): Zone {
    return { from: d - Giraffe.LEN - 0.8, to: d + Giraffe.LEN + 0.8, need: 'low' };
  }

  update(dt: number, c: Ctx): void {
    const p = c.player;
    const before = this.a;
    if (this.state === 'rest') {
      this.t -= dt;
      if (this.t <= 0) {
        this.state = 'wind';
        this.t = 0.3;
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.rate = rand(4.5, 9) * Giraffe.FAST;
        // 한 바퀴에서 세 바퀴까지 돈다.
        this.left = Math.PI * 2 * (1 + Math.floor(Math.random() * 3));
      }
    } else if (this.state === 'wind') {
      // 휘두르기 직전에 반대쪽으로 살짝 젖혀 방향을 예고한다.
      this.t -= dt;
      this.a = this.rest - this.dir * 0.5 * (1 - this.t / 0.3);
      if (this.t <= 0) {
        this.state = 'swing';
        this.left += 0.5;
      }
    } else {
      const step = Math.min(this.left, this.rate * dt);
      this.a += this.dir * step;
      this.left -= step;
      // 돌던 중에 무작위로 방향을 뒤집어 궤적을 바꾼다.
      if (this.left > 1 && Math.random() < dt * 0.8) {
        this.dir = -this.dir;
        this.left = Math.PI * 2 - (this.left % (Math.PI * 2)) + 1;
      }
      if (this.left <= 0) {
        this.state = 'rest';
        this.t = rand(0.2, 0.7);
        this.a = this.rest;
      }
    }
    this.neck.rotation.y = this.a;
    if (this.state !== 'swing' || p.low || p.y > 1.3) return;
    const rx = p.x - this.gx;
    const rz = this.d - p.d;
    const r = Math.hypot(rx, rz);
    if (r < 0.6 || r > Giraffe.LEN + 0.7) return;
    // 목이 빨라서 한 프레임에 플레이어를 건너뛸 수 있으므로, 이번 프레임에 목이 쓸고 지나간 각도 범위로 판정한다.
    const sweep = this.a - before;
    const margin = 0.8 / r;
    let delta = Math.atan2(-rz, rx) - before;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const hit = sweep >= 0 ? delta > -margin && delta < sweep + margin : delta < margin && delta > sweep - margin;
    if (hit && p.fall(FALL_HEAVY)) {
      c.animalHit();
      c.toast('기린 목에 맞았다!');
    }
  }
}

/** 길 위를 훑는 탐조등. 빛에 닿으면 바로 발각된다 */
export class Searchlight implements Entity {
  private spot: THREE.Mesh;
  private beam: THREE.Mesh;
  private tower: THREE.Vector3;

  /**
   * 탐조등 빛과 초소 탑을 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 빛이 훑는 중심 거리(m)
   * @param {number} side -1이면 탑이 길 왼쪽, 1이면 오른쪽
   * @param {number} phase 박자 위상(rad)
   * @param {number} speed 훑는 속도 배율
   */
  constructor(c: Ctx, public d: number, side: number, private phase: number, private speed: number) {
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(Searchlight.R, 24), basic(0xf2e6a6, 0.55));
    this.spot.rotation.x = -Math.PI / 2;
    this.spot.position.y = 0.06;
    this.tower = new THREE.Vector3(side * 6.5, 5, -d);
    c.add(box(0.5, 5, 0.5, 0x4a4f55, this.tower.x, 2.5, -d), d);
    c.add(box(1.4, 1.0, 1.4, 0x3a4047, this.tower.x, 5.4, -d), d);
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1), basic(0xf2e6a6, 0.25));
    // 플레이어가 가까이 와서 갱신이 시작되기 전에는 원점에 보이지 않게 숨긴다.
    this.spot.visible = this.beam.visible = false;
    c.add(this.spot, d, true);
    c.add(this.beam, d, true);
  }

  static R = 1.9;

  /**
   * 탐조등 빛이 훑는 구역을 반환한다. 빛은 중심에서 앞뒤로 3m씩 오간다.
   * @author heojeehaeng(claude)
   * @param {number} d 빛이 훑는 중심 거리(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number): Zone {
    return { from: d - 3 - Searchlight.R, to: d + 3 + Searchlight.R, need: 'sweep' };
  }

  update(_dt: number, c: Ctx): void {
    const p = c.player;
    this.spot.visible = this.beam.visible = true;
    const t = c.time * this.speed + this.phase;
    const x = Math.sin(t) * 3.4;
    const d = this.d + Math.cos(t * 0.7) * 3;
    this.spot.position.set(x, 0.06, -d);
    this.beam.position.set((x + this.tower.x) / 2, 2.5, (-d + this.tower.z) / 2);
    this.beam.lookAt(this.tower);
    this.beam.scale.z = this.tower.distanceTo(this.spot.position);
    // 넘어져 있는 동안에는 피할 방법이 없으므로 발각하지 않는다.
    if (p.state !== 'fall' && Math.hypot(p.x - x, p.d - d) < Searchlight.R) c.detect('탐조등에 걸렸다!');
  }
}

/** 지정한 거리에 처음 도달했을 때 안내 문구를 한 번 띄운다 */
export class Hint implements Entity {
  private shown = false;

  /**
   * 안내 문구를 등록한다.
   * @author heojeehaeng(claude)
   * @param {number} d 문구를 띄울 거리(m)
   * @param {string} text 안내 문구
   */
  constructor(public d: number, private text: string) {}

  update(_dt: number, c: Ctx): void {
    if (this.shown || c.player.d < this.d) return;
    this.shown = true;
    c.hintOnce(this.text);
  }
}

/** 차 뒤에 "핵 운반 중" 딱지를 붙이고 길옆을 달리는 '쿠방' 택배 트럭 */
export class Truck implements Entity {
  always = true;
  private g = new THREE.Group();
  private d0: number;

  /**
   * 택배 트럭을 만들어 길옆에 놓는다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 처음 서 있는 거리(m)
   * @param {number} x 달리는 x
   * @param {number} until 이 거리까지 달리고 멈춘다(m)
   */
  constructor(c: Ctx, public d: number, x: number, private until: number) {
    this.d0 = d;
    this.g.add(box(2.2, 2.2, 4.2, 0xf2f2f2, 0, 1.7, 0.4), box(2.2, 1.5, 1.4, 0x2f6fd1, 0, 1.25, -2.4));
    for (const wx of [-1, 1]) for (const wz of [-2.2, 1.6]) this.g.add(box(0.3, 0.8, 0.8, 0x1e1e1e, wx * 1.05, 0.4, wz));
    const back = makeSign('핵 운반 중', 1.9, 0.8, '#ffe14d', '#c00000', 0);
    back.position.set(0, 1.0, 2.52);
    const brand = makeSign('쿠방', 1.6, 0.7, '#ffffff', '#2f6fd1', 0);
    brand.position.set(0, 1.9, 2.52);
    this.g.add(back, brand);
    this.g.position.set(x, 0, -d);
    c.add(this.g, d, true);
  }

  update(dt: number, c: Ctx): void {
    const pd = c.player.d;
    // 플레이어보다 조금 느리게 달려, 뒤에 붙인 딱지가 한동안 보이게 한다.
    if (this.d - pd < 45 && this.d < this.until) this.d += 13 * dt;
    this.g.position.z = -this.d;
    this.g.visible = this.d > pd - 20 && this.d < pd + 190;
  }

  reset(): void {
    this.d = this.d0;
  }
}

/** 폭이 넓고 긴 검은 리무진. 장군을 태우고 빠르게 마주 달려온다 */
export class Limo implements Entity {
  private g = makeLimo();
  private honked = false;
  private spent = false;

  /**
   * 장군 차를 만들어 길 앞쪽에 놓는다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 처음 서 있는 거리(m)
   * @param {number} x 달리는 x
   */
  constructor(c: Ctx, public d: number, private x: number) {
    this.g.position.set(x, 0, -d);
    c.add(this.g, d, true);
  }

  static SPEED = 30;

  /**
   * 장군 차와 마주치는 구역을 반환한다. 차가 길의 절반을 막으므로 나머지 절반으로만 지나갈 수 있다.
   * @author heojeehaeng(claude)
   * @param {number} d 처음 서 있는 거리(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number): Zone {
    const [near, far] = meet(d, Limo.SPEED, 170);
    return { from: near - 5, to: far + 5, need: 'lane' };
  }

  update(dt: number, c: Ctx): void {
    const p = c.player;
    const dd = this.d - p.d;
    if (dd < 170) this.d -= Limo.SPEED * dt;
    this.g.position.set(this.x, 0, -this.d);
    this.g.visible = this.d > p.d - 30 && this.d < p.d + 210;
    if (!this.honked && dd < 130 && dd > 0) {
      this.honked = true;
      c.toast('빵빵! 장군님 차가 지나갑니다', 1.2);
    }
    // 차가 길어서 앞뒤 5m 안에 있으면 부딪힌 것으로 본다. 높아서 점프로는 넘을 수 없다.
    if (!this.spent && crossed(p, this.d, 5) && Math.abs(p.x - this.x) < 2.0 && p.y < 1.7 && p.fall(FALL_HEAVY)) {
      this.spent = true;
      c.shake(0.5);
      c.toast('장군님 차에 치였다!');
    }
  }
}

/** 엄지를 치켜들고 깡충깡충 뛰어오는 육군 마스코트 '굳건이' */
export class Mascot implements Entity {
  private g = makeMascot();
  private phase = rand(0, 6);
  private rate = rand(1.6, 2.6);
  private x = 0;

  /**
   * 마스코트를 만들어 길 앞쪽에 놓는다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 처음 서 있는 거리(m)
   */
  constructor(c: Ctx, public d: number) {
    this.g.rotation.y = Math.PI;
    this.g.position.set(0, 0, -d);
    c.add(this.g, d, true);
  }

  /**
   * 굳건이와 마주치는 구역을 반환한다.
   * @author heojeehaeng(claude)
   * @param {number} d 처음 서 있는 거리(m)
   * @return {Zone} 동작 구역
   */
  static zone(d: number): Zone {
    const [near, far] = meet(d, 5, 130);
    return { from: near - 0.8, to: far + 0.8, need: 'sweep' };
  }

  update(dt: number, c: Ctx): void {
    const p = c.player;
    if (this.d - p.d < 130) this.d -= 5 * dt;
    // 깡충깡충 뛰면서 길을 좌우로 크게 오간다.
    this.x = Math.sin(c.time * this.rate + this.phase) * 3.2;
    this.g.position.set(this.x, Math.abs(Math.sin(c.time * 7)) * 0.5, -this.d);
    this.g.visible = this.d > p.d - 20 && this.d < p.d + 200;
    if (crossed(p, this.d, 0.8) && Math.abs(p.x - this.x) < 1.15 && p.y < 1.6 && p.fall(FALL_LIGHT)) c.toast('굳건이: "엄지 척!"');
  }
}

/** 앞에서부터 쿵쿵 뛰어오는 거대한 거인. 발에 밟히면 탈북 실패로 판이 끝난다 */
export class Giant implements Entity {
  private body = new THREE.Group();
  private feet: THREE.Group[] = [];
  private footY = [0, 0];
  private pos = [new THREE.Vector2(), new THREE.Vector2()];
  private from = new THREE.Vector2();
  private to = new THREE.Vector2();
  private mark: THREE.Mesh;
  private state: 'wait' | 'run' | 'done' = 'wait';
  private moving = 0;
  private t = 0;

  /**
   * 거인과 발 디딜 자리를 알리는 붉은 원을 만들어 배치한다.
   * @author heojeehaeng(claude)
   * @param {Ctx} c 게임 창구
   * @param {number} d 처음 서 있는 거리(m)
   */
  constructor(c: Ctx, public d: number) {
    const skin = 0xc98a6c;
    this.body.add(box(6, 7, 3.2, skin, 0, 14, 0), box(6.2, 2.6, 3.4, 0x4a3323, 0, 9.6, 0));
    const head = makeGiantHead(skin);
    head.position.y = 20;
    // 몸을 숙이고 내려다보는 것처럼 고개를 살짝 기울인다.
    head.rotation.x = 0.18;
    this.body.add(head);
    this.body.add(box(1.6, 7.5, 1.6, skin, -4, 13.5, 0), box(1.6, 7.5, 1.6, skin, 4, 13.5, 0));
    for (let i = 0; i < 2; i++) {
      const foot = new THREE.Group();
      foot.add(box(2.4, 1, 4.2, skin, 0, 0.5, 0.7), box(1.9, 8.2, 1.9, skin, 0, 5, 0));
      this.feet.push(foot);
      this.pos[i].set(i ? 2 : -2, d + i * 7);
      c.add(foot, d, true);
    }
    this.mark = new THREE.Mesh(new THREE.CircleGeometry(Giant.R, 24), basic(WARN, 0.5));
    this.mark.rotation.x = -Math.PI / 2;
    this.mark.visible = false;
    c.add(this.body, d, true);
    c.add(this.mark, d, true);
    this.place(false);
  }

  static SPEED = 17;
  /** 한 걸음에 걸리는 시간(초). 이 시간 동안 붉은 원이 먼저 보인다 */
  static STEP = 0.42;
  /** 발에 밟히는 반경(m) */
  static R = 1.9;

  update(dt: number, c: Ctx): void {
    const p = c.player;
    const dd = this.d - p.d;
    const visible = dd < 280 && dd > -70;
    if (this.state === 'done') {
      this.place(visible);
      return;
    }
    if (this.state === 'wait') {
      if (dd < 175 && dd > 0) {
        this.state = 'run';
        c.toast('거인이다! 발밑의 붉은 원을 피하세요', 2);
        this.startStep(p.x);
      }
      this.place(visible);
      return;
    }
    this.d -= Giant.SPEED * dt;
    this.t += dt;
    const k = Math.min(1, this.t / Giant.STEP);
    this.pos[this.moving].lerpVectors(this.from, this.to, k);
    this.footY[this.moving] = Math.sin(k * Math.PI) * 5;
    if (k >= 1) {
      c.shake(Math.abs(dd) < 70 ? 0.45 : 0.12);
      // 발이 땅에 닿는 순간 그 자리에 있으면 밟힌다.
      // 넘어져 있어 피할 수 없는 플레이어는 밟지 않는다.
      const dodgeable = p.state === 'run' && p.invulnT <= 0;
      if (dodgeable && Math.hypot(p.x - this.to.x, p.d - this.to.y) < Giant.R + 0.3 && p.y < 4) c.kill('거인에게 밟혔습니다');
      this.moving = 1 - this.moving;
      // 넘어진 플레이어 쪽으로는 발을 디디지 않도록 반대편을 겨눈다.
      this.startStep(p.state === 'run' ? p.x : -Math.sign(p.x || 1) * 5);
    }
    if (this.d < p.d - 55) {
      this.state = 'done';
      this.mark.visible = false;
    }
    this.place(visible);
  }

  /**
   * 다음 발을 디딜 자리를 정하고 그 자리에 붉은 원을 띄운다.
   * @author heojeehaeng(claude)
   * @param {number} px 플레이어의 x
   */
  private startStep(px: number): void {
    this.t = 0;
    this.from.copy(this.pos[this.moving]);
    const side = this.moving === 0 ? -1 : 1;
    // 왼발과 오른발을 번갈아 디디되, 플레이어 쪽으로 치우쳐 디딘다.
    const x = Math.max(-3.3, Math.min(3.3, side * 0.9 + px * 0.6 + rand(-1, 1)));
    this.to.set(x, this.d - Giant.SPEED * Giant.STEP - 5);
    this.mark.position.set(x, 0.05, -this.to.y);
    this.mark.visible = true;
  }

  /**
   * 몸통과 두 발을 현재 위치에 맞춰 놓는다.
   * @author heojeehaeng(claude)
   * @param {boolean} visible 화면에 그릴지 여부
   */
  private place(visible: boolean): void {
    this.body.visible = visible;
    this.body.position.set((this.pos[0].x + this.pos[1].x) / 2, Math.max(this.footY[0], this.footY[1]) * 0.12, -this.d);
    this.feet.forEach((f, i) => {
      f.visible = visible;
      f.position.set(this.pos[i].x, this.footY[i], -this.pos[i].y);
    });
  }
}

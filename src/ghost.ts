import * as THREE from 'three';
import { FONT, GRAVITY } from './config';
import { crawlPerson, HERO_SKIN, makePerson, swingPerson } from './models';

/**
 * 함께 달리는 리용길들을 구분하는 옷 색. 방에 들어온 순서대로 입는다. 첫 번째는 혼자 달릴 때의 파란 옷이다.
 * 붉은색은 위험 표시에 쓰므로 넣지 않는다.
 */
export const PEER_COLORS = [0x4f6a8f, 0xf2a65a, 0x6fbf9a, 0xa98bd6];

/** 위치 소식에 실어 보내는 자세 표시 */
export const POSE = { SLIDE: 1, CRAWL: 2, FALL: 4, BOOST: 8 } as const;

/** 이 거리(m)보다 크게 어긋나면 따라가지 않고 그 자리로 바로 옮긴다. 체크포인트로 돌아간 경우다 */
const SNAP = 30;
/** 소식이 이 시간(초) 넘게 끊기면 더 앞으로 보내지 않고 세워 둔다 */
const STALE = 1;

const faded = new Map<THREE.Material, THREE.Material>();

/**
 * 재질의 반투명한 사본을 반환한다. 같은 재질은 사본 하나를 함께 쓴다.
 * @author heojeehaeng(claude)
 * @param {THREE.Material} m 원래 재질
 * @return {THREE.Material} 반투명한 재질
 */
function fade(m: THREE.Material): THREE.Material {
  let f = faded.get(m);
  if (!f) {
    f = m.clone();
    f.transparent = true;
    f.opacity = 0.55;
    f.userData.shared = true;
    faded.set(m, f);
  }
  return f;
}

/**
 * 머리 위에 띄울 이름표를 만든다. 달리면서 빨리 읽혀야 하므로 Pretendard로 쓴다.
 * @author heojeehaeng(claude)
 * @param {string} nick 이름
 * @param {number} color 이름표 바탕색
 * @return {THREE.Sprite} 이름표
 */
function makeTag(nick: string, color: number): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 320;
  cv.height = 80;
  const g = cv.getContext('2d')!;
  g.font = `800 44px ${FONT}`;
  const w = Math.min(304, g.measureText(nick).width + 44);
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.strokeStyle = '#171922';
  g.lineWidth = 6;
  g.fillRect(160 - w / 2, 8, w, 64);
  g.strokeRect(160 - w / 2, 8, w, 64);
  g.fillStyle = '#171922';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(nick, 160, 42, 290);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // 이름표는 깊이를 쓰지 않아 외곽선이 덧그려지지 않게 한다.
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  tag.scale.set(2, 0.5, 1);
  tag.position.y = 2.45;
  return tag;
}

/**
 * 함께 달리는 다른 사람의 모습. 가끔 오는 위치 소식 사이를 속도로 이어 그리며, 부딪히지 않고 앞길을 가리지 않도록 반투명하게 보인다.
 */
export class Ghost {
  group = new THREE.Group();
  /** 화면에 그리는 거리(m) */
  d = 0;
  private pivot = new THREE.Group();
  private model: THREE.Group;
  private x = 0;
  private y = 0;
  private vy = 0;
  private speed = 0;
  private flags = 0;
  /** 소식으로 미루어 본 지금의 거리(m) */
  private goalD = 0;
  private goalX = 0;
  /** 마지막 소식을 받은 뒤 흐른 시간(초) */
  private age = 0;
  private phase = 0;

  /**
   * 반투명한 사람 모델과 이름표를 만든다.
   * @author heojeehaeng(claude)
   * @param {string} nick 이름
   * @param {number} color 옷 색
   * @param {number} x 출발선에서 설 좌우 위치
   */
  constructor(nick: string, color: number, x: number) {
    this.model = makePerson({ shirt: color, pants: 0x3a4250, skin: HERO_SKIN, hat: color, pack: true, scarf: 0xe9e2cf });
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // 발밑 그림자처럼 이미 반투명한 것은 그대로 둔다.
      if (mesh.isMesh && !Array.isArray(mesh.material) && !mesh.material.transparent) mesh.material = fade(mesh.material);
    });
    // 관절을 허리 높이에 두는 것은 리용길과 같다.
    this.model.position.y = -0.9;
    this.pivot.position.y = 0.9;
    this.pivot.add(this.model);
    this.group.add(this.pivot, makeTag(nick, color));
    this.x = this.goalX = x;
    this.group.position.set(x, 0, 0);
  }

  /**
   * 새로 받은 위치 소식을 반영한다.
   * @author heojeehaeng(claude)
   * @param {number} d 달린 거리(m)
   * @param {number} x 좌우 위치
   * @param {number} y 높이
   * @param {number} vy 수직 속도(m/s)
   * @param {number} speed 앞으로 가는 속도(m/s)
   * @param {number} flags 자세 표시
   */
  feed(d: number, x: number, y: number, vy: number, speed: number, flags: number): void {
    this.goalD = d;
    this.goalX = x;
    this.y = y;
    this.vy = vy;
    this.speed = speed;
    this.flags = flags;
    this.age = 0;
  }

  /**
   * 한 프레임만큼 움직이고 자세를 갱신한다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   * @param {number} myD 내가 달린 거리(m). 멀리 떨어진 사람은 그리지 않는다
   */
  update(dt: number, myD: number): void {
    this.age += dt;
    // 소식이 끊겼거나 넘어져 있으면 앞으로 보내지 않는다.
    const speed = this.age < STALE && !(this.flags & POSE.FALL) ? this.speed : 0;
    this.goalD += speed * dt;
    if (Math.abs(this.goalD - this.d) > SNAP) this.d = this.goalD;
    else {
      // 같은 속도로 나아가면서, 소식과 어긋난 만큼은 조금씩 따라잡는다.
      this.d += speed * dt;
      this.d += (this.goalD - this.d) * Math.min(1, dt * 5);
    }
    this.x += (this.goalX - this.x) * Math.min(1, dt * 8);
    this.vy -= GRAVITY * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    const gap = this.d - myD;
    this.group.visible = gap > -30 && gap < 200;
    if (!this.group.visible) return;
    this.group.position.set(this.x, this.y, -this.d);
    this.pose(dt, speed);
  }

  /**
   * 자세 표시에 맞춰 몸을 눕히거나 팔다리를 움직인다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   * @param {number} speed 지금 앞으로 가는 속도(m/s)
   */
  private pose(dt: number, speed: number): void {
    const p = this.pivot;
    const f = this.flags;
    p.rotation.y = p.rotation.z = 0;
    if (f & POSE.FALL) {
      p.rotation.x = Math.PI / 2;
      p.position.y = 0.35;
      swingPerson(this.model, 0, 0);
      return;
    }
    let rot = 0;
    let h = 0.9;
    if (f & POSE.CRAWL) {
      rot = -1.44;
      h = 0.27;
    } else if (f & POSE.SLIDE) {
      rot = -1.36;
      h = 0.3;
    }
    if (rot === 0 && speed > 2) rot = f & POSE.BOOST ? -0.5 : -0.2;
    p.rotation.x += (rot - p.rotation.x) * Math.min(1, dt * 18);
    p.position.y += (h - p.position.y) * Math.min(1, dt * 18);
    this.phase += dt * speed * (f & POSE.CRAWL ? 0.75 : 1.1);
    if (f & POSE.CRAWL) {
      crawlPerson(this.model, this.phase);
      return;
    }
    swingPerson(this.model, this.phase, this.y > 0 ? 0.3 : speed > 0.5 ? 0.9 : 0);
    const { legL, legR, armL, armR, kneeL, kneeR, elbowL, elbowR } = this.model.userData.parts;
    if (this.y > 0) kneeL.rotation.x = kneeR.rotation.x = -1.2;
    if (f & POSE.BOOST) {
      armL.rotation.x = armR.rotation.x = -1.35;
      elbowL.rotation.x = elbowR.rotation.x = 0;
    }
    if (f & POSE.SLIDE && this.y === 0) {
      legL.rotation.x = legR.rotation.x = -0.12;
      kneeL.rotation.x = kneeR.rotation.x = 0;
      armL.rotation.set(2.95, 0, 0.14);
      armR.rotation.set(2.95, 0, -0.14);
      elbowL.rotation.x = elbowR.rotation.x = 0;
      // 옆으로 벌린 팔을 다음 프레임에 되돌리도록 표시해 둔다.
      this.model.userData.posed = true;
    }
  }
}

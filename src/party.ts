import * as THREE from 'three';
import { COURSE_LEN } from './config';
import { box, makePerson, makeSign, mat, PersonOpts, swingPerson } from './models';
import { Player } from './player';

/** 결승 축하 연출이 게임에 접근할 때 쓰는 창구 */
export interface PartyHost {
  player: Player;
  toast(msg: string, sec?: number): void;
  shake(power: number): void;
  /** 색종이를 터뜨린다. (x, y, z)에서 시작해 (vx, vz) 쪽으로 쏠려 날아간다 */
  confetti(x: number, y: number, z: number, count: number, vx: number, vz: number): void;
}

/** 라면 그릇을 들고 맞이하기, 폭죽 터뜨리기, 웰컴 드링크 건네기, 만세 부르기 */
type Role = 'greet' | 'pop' | 'drink' | 'cheer';

interface Member {
  g: THREE.Group;
  role: Role;
  /** 문밖으로 나오기 시작하는 시각(초) */
  at: number;
  /** 문에서 설 자리까지 걸어가는 길. x와 생활관 벽에서 떨어진 거리(m) */
  path: THREE.Vector2[];
  /** 길의 전체 길이(m) */
  total: number;
  phase: number;
}

/** 문이 열리고 첫 사람이 나오는 시각(초). 노크를 시작한 때부터 잰다 */
export const PARTY_FROM = 2.2;
/** 문밖으로 걸어 나오는 속도(m/s) */
const WALK = 4.5;
/** 잔을 쥐는 손의 위치. 팔 관절 기준이다 */
const HAND = new THREE.Vector3(0, -0.52, -0.04);

const smooth = (k: number) => {
  const t = Math.max(0, Math.min(1, k));
  return t * t * (3 - 2 * t);
};

/** 리용길이 문을 두드리면 생활관 인원들이 건물 밖으로 나와 축하해 주는 결승 연출 */
export class Party {
  private members: Member[] = [];
  private glass = new THREE.Group();
  private hand = new THREE.Object3D();
  private muzzle = new THREE.Object3D();
  private z0 = -COURSE_LEN;
  private nextPop = 0;
  private recoil = 0;
  private offered = false;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  /**
   * 생활관 안에 숨어 있는 인원들과 웰컴 드링크 잔을 만든다.
   * @author heojeehaeng(claude)
   * @param {Function} add 장면에 물체를 넣는 함수
   * @param {PersonOpts} look 병사의 옷차림
   */
  constructor(add: (obj: THREE.Object3D) => void, look: PersonOpts) {
    // 문은 왼쪽 경첩을 축으로 바깥으로 열려 문 왼쪽을 가리므로, 모두 문 오른쪽과 리용길 둘레에 선다.
    this.member(add, look, 'greet', PARTY_FROM, [[0.1, 0.45], [0.85, 1.25]]);
    this.member(add, look, 'pop', PARTY_FROM + 0.25, [[0.1, 0.45], [1.2, 0.9], [2.1, 1.6]]);
    this.member(add, look, 'drink', PARTY_FROM + 0.55, [[0.1, 0.45], [0.75, 0.75], [1.45, 1.9], [1.15, 2.7]]);
    this.member(add, look, 'cheer', PARTY_FROM + 0.85, [[0.1, 0.45], [1.5, 0.8], [2.7, 2.9]]);
    this.member(add, look, 'cheer', PARTY_FROM + 1.1, [[0.05, 0.45], [-0.42, 1.5], [-0.55, 2.7], [-1.0, 3.6]]);
    this.buildGlass();
    add(this.glass);
  }

  /**
   * 축하하는 병사 한 명을 만들어 문 안쪽에 숨겨 둔다.
   * @author heojeehaeng(claude)
   * @param {Function} add 장면에 물체를 넣는 함수
   * @param {PersonOpts} look 병사의 옷차림
   * @param {Role} role 맡은 일
   * @param {number} at 문밖으로 나오기 시작하는 시각(초)
   * @param {number[][]} pts 걸어갈 길. [x, 벽에서 떨어진 거리] 목록
   */
  private member(add: (obj: THREE.Object3D) => void, look: PersonOpts, role: Role, at: number, pts: number[][]): void {
    const g = makePerson({ ...look, face: 'grin' });
    const { armR } = g.userData.parts;
    if (role === 'greet') {
      // 먹던 라면 그릇을 든 채로 나온다.
      g.add(box(0.4, 0.2, 0.4, 0xc0392b, 0, 0.95, -0.4), box(0.34, 0.04, 0.34, 0xf2d27a, 0, 1.06, -0.4));
    } else if (role === 'pop') {
      // 손에 든 고깔 폭죽. 넓은 쪽이 손 바깥을 향한다.
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 10), mat(0xffd23f));
      cone.position.set(0, -0.64, 0);
      armR.add(cone, box(0.2, 0.05, 0.2, 0xd8392f, 0, -0.74, 0));
      this.muzzle.position.set(0, -0.84, 0);
      armR.add(this.muzzle);
    } else if (role === 'drink') {
      this.hand.position.copy(HAND);
      armR.add(this.hand);
    }
    const path = pts.map(([x, dz]) => new THREE.Vector2(x, dz));
    let total = 0;
    for (let i = 1; i < path.length; i++) total += path[i].distanceTo(path[i - 1]);
    g.position.set(0, 0, this.z0 - 1);
    g.visible = false;
    add(g);
    this.members.push({ g, role, at, path, total, phase: this.members.length * 1.7 });
  }

  /**
   * "웰컴 드링크" 팻말이 꽂힌 칵테일 잔을 만든다. 원점은 손으로 쥐는 잔 다리 가운데다.
   * @author heojeehaeng(claude)
   */
  private buildGlass(): void {
    const clear = new THREE.MeshLambertMaterial({ color: 0xe8f4f8, transparent: true, opacity: 0.55 });
    const bowl = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.16, 14, 1, true), clear);
    // 고깔을 뒤집어 위가 벌어진 칵테일 잔 모양을 만든다.
    bowl.rotation.x = Math.PI;
    bowl.position.y = 0.16;
    const drink = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.125, 14), mat(0xff8a5c));
    drink.rotation.x = Math.PI;
    drink.position.y = 0.145;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), mat(0xe8f4f8));
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 12), mat(0xe8f4f8));
    foot.position.y = -0.08;
    // 잔에 꽂은 종이우산과 빨대
    const umbrella = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.05, 8), mat(0xd8392f));
    umbrella.position.set(0.07, 0.34, 0);
    const pick = box(0.012, 0.2, 0.012, 0x8a6a45, 0.07, 0.25, 0);
    const straw = box(0.016, 0.3, 0.016, 0xffd23f, -0.06, 0.28, 0);
    straw.rotation.z = 0.35;
    // 멀리서도 읽히도록 잔보다 큰 팻말을 꽂는다.
    const label = makeSign('웰컴 드링크', 0.95, 0.3, '#fff7e6', '#d8392f', 0);
    label.position.set(0, 0.44, 0);
    this.glass.add(bowl, drink, stem, foot, umbrella, pick, straw, label, box(0.016, 0.22, 0.016, 0x8a6a45, 0, 0.34, -0.01));
    this.glass.visible = false;
  }

  /**
   * 축하 연출을 한 프레임 진행한다. 인원들이 차례로 걸어 나와 리용길을 둘러싸고, 폭죽을 터뜨리고, 웰컴 드링크를 건넨다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   * @param {number} t 노크를 시작한 뒤 흐른 시간(초)
   * @param {PartyHost} host 게임 창구
   */
  update(dt: number, t: number, host: PartyHost): void {
    if (t < PARTY_FROM) return;
    const p = host.player;
    const px = p.x;
    const pz = -p.d;
    this.recoil = Math.max(0, this.recoil - dt * 3);
    let reach = 0;
    let cheers = 0;
    let toward = 0;
    for (const m of this.members) {
      if (t < m.at) continue;
      m.g.visible = true;
      const { armL, armR, elbowL, elbowR } = m.g.userData.parts;
      const dist = (t - m.at) * WALK;
      if (dist < m.total) {
        this.walk(m, dist, t);
        // 잔을 든 사람은 걸어오는 동안에도 잔을 앞으로 받쳐 든다.
        if (m.role === 'drink') armR.rotation.set(1.2, 0, 0.1);
      } else {
        const end = m.path[m.path.length - 1];
        const x = end.x;
        const z = this.z0 + end.y;
        // 다 나온 뒤에는 리용길을 바라보고 선다. 사람 모델의 앞은 -z다.
        m.g.rotation.y = Math.atan2(x - px, z - pz);
        swingPerson(m.g, 0, 0);
        const since = t - m.at - m.total / WALK;
        const wave = Math.sin(t * 9 + m.phase) * 0.28;
        let hop = Math.abs(Math.sin(t * 8 + m.phase)) * 0.15;
        // 기본은 두 팔을 들고 폴짝폴짝 뛰는 만세다.
        armL.rotation.set(2.7 + wave, 0, -0.35);
        armR.rotation.set(2.7 - wave, 0, 0.35);
        if (m.role === 'greet') {
          // 라면 그릇을 받쳐 든 채 몸만 들썩인다.
          armL.rotation.set(1.15, 0, -0.1);
          armR.rotation.set(1.15, 0, 0.1);
          elbowL.rotation.x = elbowR.rotation.x = 0.5;
          hop *= 0.4;
        } else if (m.role === 'pop') {
          armR.rotation.set(2.5 - this.recoil * 0.6, 0, 0.3);
          if (since > 0.25 && t >= this.nextPop) this.pop(host, t, px, pz);
        } else if (m.role === 'drink') {
          reach = smooth((since - 0.25) / 0.5);
          const give = smooth((since - 0.85) / 0.35);
          cheers = smooth((since - 1.45) / 0.6);
          toward = Math.atan2(px - x, pz - z);
          // 잔을 넘겨줄 때까지는 팔을 뻗어 내밀고, 넘겨준 뒤에는 함께 만세를 부른다.
          if (give < 1) {
            armR.rotation.set(1.35, 0, 0.05);
            hop *= 0.3;
          }
          if (since > 0.2 && !this.offered) {
            this.offered = true;
            host.toast('"웰컴 드링크 나왔습니다~"', 1.8);
          }
          m.g.position.set(x, hop, z);
          m.g.updateMatrixWorld(true);
          this.hand.getWorldPosition(this.a);
          // 건네는 동안 잔은 병사의 손에서 리용길의 손으로 옮겨 간다.
          p.celebrate(t, reach, cheers, toward);
          p.group.updateMatrixWorld(true);
          p.hand.getWorldPosition(this.b);
          this.glass.position.copy(this.a).lerp(this.b, give);
          continue;
        }
        m.g.position.set(x, hop, z);
      }
      if (m.role === 'drink') {
        m.g.updateMatrixWorld(true);
        this.hand.getWorldPosition(this.glass.position);
        this.glass.visible = true;
      }
    }
    // 잔을 든 병사가 아직 오는 중이면 리용길은 두 팔을 들고 기뻐한다.
    if (reach === 0 && cheers === 0) p.celebrate(t, 0, 0, 0);
  }

  /**
   * 병사를 문에서 설 자리까지 걸어가는 길 위에 놓는다.
   * @author heojeehaeng(claude)
   * @param {Member} m 병사
   * @param {number} dist 문에서부터 걸어온 거리(m)
   * @param {number} t 발걸음 박자에 쓰는 시간(초)
   */
  private walk(m: Member, dist: number, t: number): void {
    let left = dist;
    for (let i = 1; i < m.path.length; i++) {
      const from = m.path[i - 1];
      const to = m.path[i];
      const len = to.distanceTo(from);
      if (left > len && i < m.path.length - 1) {
        left -= len;
        continue;
      }
      const k = Math.min(1, left / len);
      m.g.position.set(from.x + (to.x - from.x) * k, 0, this.z0 + from.y + (to.y - from.y) * k);
      // 걸어가는 쪽을 바라본다.
      m.g.rotation.y = Math.atan2(-(to.x - from.x), -(to.y - from.y));
      break;
    }
    swingPerson(m.g, t * 16, 0.8);
  }

  /**
   * 폭죽을 터뜨려 리용길 머리 위로 색종이를 날린다. 처음 한 번은 크게, 그 뒤로는 작게 계속 터뜨린다.
   * @author heojeehaeng(claude)
   * @param {PartyHost} host 게임 창구
   * @param {number} t 노크를 시작한 뒤 흐른 시간(초)
   * @param {number} px 리용길의 x
   * @param {number} pz 리용길의 z
   */
  private pop(host: PartyHost, t: number, px: number, pz: number): void {
    const first = this.nextPop === 0;
    this.nextPop = t + 2.3;
    this.recoil = 1;
    this.muzzle.getWorldPosition(this.a);
    const dx = px - this.a.x;
    const dz = pz - this.a.z;
    const len = Math.hypot(dx, dz) || 1;
    host.confetti(this.a.x, this.a.y, this.a.z, first ? 80 : 40, (dx / len) * 3, (dz / len) * 3);
    host.shake(first ? 0.25 : 0.08);
  }
}

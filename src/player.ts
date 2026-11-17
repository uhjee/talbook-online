import * as THREE from 'three';
import { BOOST_AFTER, BOOST_MULT, BOOST_TIME, FALL_RATE, HIDE_RATE, ROAD_HALF, SIDE_SPEED, SPEED_BASE, SPEED_MAX } from './config';
import { Input } from './input';
import { HERO_SKIN, makePerson, setHeroWear, swingPerson } from './models';
import { castShadows } from './world';

const GRAVITY = 22;
const JUMP_V = 7.6;
const SLIDE_TIME = 0.5;

export class Player {
  group = new THREE.Group();
  private pivot = new THREE.Group();
  private model: THREE.Group;
  d = 0;
  /** 직전 프레임의 거리. 빠르게 달릴 때 얇은 장애물을 건너뛰지 않도록 판정에 쓴다 */
  prevD = 0;
  x = 0;
  y = 0;
  vy = 0;
  speed = 0;
  state: 'run' | 'fall' | 'stop' = 'stop';
  slideT = 0;
  hiding = false;
  fallT = 0;
  invulnT = 0;
  /** 마지막으로 넘어진 뒤 흐른 시간(초) */
  cleanT = 0;
  falls = 0;
  /** 장애물에 당한 횟수(넘어짐과 발각). 옷과 몸이 망가지는 정도를 정한다 */
  hits = 0;
  private wear = -1;
  /** 부스터가 켜져 있는 남은 시간(초) */
  boostT = 0;
  /** 부스터를 쓴 횟수. 대사를 띄울 때 새로 썼는지 알아보는 데 쓴다 */
  boosts = 0;
  private runPhase = 0;

  /**
   * 리용길 모델을 만들고 초기 상태로 둔다.
   * @author heojeehaeng(claude)
   */
  constructor() {
    this.model = makePerson({ shirt: 0x4f6a8f, pants: 0x3a4250, skin: HERO_SKIN, hat: 0x4f6a8f, pack: true, scarf: 0xe9e2cf, noShadow: true, wear: true });
    // 넘어짐과 엎드리기를 몸 가운데 기준으로 돌리기 위해 관절을 허리 높이에 둔다.
    this.model.position.y = -0.9;
    this.pivot.position.y = 0.9;
    this.pivot.add(this.model);
    this.group.add(this.pivot);
  }

  /**
   * 슬라이드 중이거나 기어가는 중이어서 몸이 낮은 상태인지 반환한다.
   * @author heojeehaeng(claude)
   * @return {boolean} 몸이 낮은 상태 여부
   */
  get low(): boolean {
    return this.slideT > 0 || this.hiding;
  }

  /**
   * 부스터로 평소보다 훨씬 빠르게 달리는 중인지 반환한다. 부스터가 끝난 뒤 속도가 가라앉을 때까지 유지된다.
   * @author heojeehaeng(claude)
   * @return {boolean} 부스터 질주 여부
   */
  get boosting(): boolean {
    return this.state === 'run' && this.speed > SPEED_MAX * 1.2;
  }

  /**
   * 지정한 거리에서 다시 출발하도록 상태를 초기화한다.
   * @author heojeehaeng(claude)
   * @param {number} d 다시 출발할 거리(m)
   * @param {number} invuln 무적 시간(초)
   */
  respawn(d: number, invuln: number): void {
    this.d = this.prevD = d;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.speed = 0;
    this.state = 'run';
    this.slideT = 0;
    this.hiding = false;
    this.fallT = 0;
    this.invulnT = invuln;
    this.cleanT = 0;
    this.boostT = 0;
  }

  /**
   * 플레이어를 넘어뜨린다. 무적이거나 이미 넘어진 상태면 무시한다.
   * @author heojeehaeng(claude)
   * @param {number} duration 넘어져 있는 시간(초)
   * @param {boolean} launch true면 하늘로 날아간다
   * @return {boolean} 실제로 넘어졌는지 여부
   */
  fall(duration: number, launch = false): boolean {
    if (this.state !== 'run' || this.invulnT > 0) return false;
    this.state = 'fall';
    this.fallT = duration;
    this.falls++;
    this.hits++;
    this.cleanT = 0;
    this.slideT = 0;
    this.hiding = false;
    this.speed = 0;
    this.boostT = 0;
    if (launch) this.vy = 13;
    return true;
  }

  /**
   * 입력을 반영해 한 프레임만큼 이동하고 모델 자세를 갱신한다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   * @param {Input} input 입력 상태
   */
  update(dt: number, input: Input): void {
    this.prevD = this.d;
    if (this.invulnT > 0) this.invulnT -= dt;
    // 넘어지거나 날아가는 동안에는 낙하와 구르기를 더 빠르게 진행한다.
    const air = this.state === 'fall' ? dt * FALL_RATE : dt;
    if (this.state === 'run') this.updateRun(dt, input);
    else if (this.state === 'fall') {
      // 넘어져 있는 동안 누른 입력은 버린다. 남겨 두면 일어나자마자 부스터나 점프가 나간다.
      input.dropQueued();
      this.fallT -= dt;
      // 지뢰로 날아가는 동안에는 앞으로 조금 밀려난다.
      if (this.y > 0) this.d += 6 * dt;
      if (this.fallT <= 0 && this.y <= 0) {
        this.state = 'run';
        this.invulnT = 1.0;
      }
    }
    this.vy -= GRAVITY * air;
    this.y += this.vy * air;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
    }
    this.pose(dt);
  }

  private updateRun(dt: number, input: Input): void {
    const grounded = this.y === 0;
    this.hiding = input.hideHeld && grounded;
    // 기어가는 동안에는 절반 속도로 움직인다. 멈춰 있으면 일어나는 순간 시야에 걸리는 자리가 생기기 때문이다.
    const rate = this.hiding ? HIDE_RATE : 1;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.x += (dir * SIDE_SPEED * dt + input.takeDrag()) * rate;
    this.x = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, this.x));
    if (input.takeJump() && grounded && !this.hiding) {
      this.vy = JUMP_V;
      this.slideT = 0;
    }
    if (input.takeSlide() && grounded) this.slideT = SLIDE_TIME;
    if (this.slideT > 0) this.slideT -= dt;
    this.cleanT += dt;
    const target = (this.cleanT > BOOST_AFTER ? SPEED_MAX : SPEED_BASE) * rate;
    // 부스터: 아주 잠깐 속도를 크게 올리고, 끝나면 원래 속도로 서서히 돌아온다.
    if (input.takeBoost() && !this.hiding) {
      this.boostT = BOOST_TIME;
      this.boosts++;
    }
    // 엎드리면 남아 있던 부스터는 바로 끊는다.
    if (this.hiding) this.boostT = 0;
    if (this.boostT > 0) {
      this.boostT -= dt;
      this.speed = Math.max(this.speed, SPEED_BASE * BOOST_MULT);
    }
    this.speed += (target - this.speed) * Math.min(1, dt * 6);
    this.d += this.speed * dt;
  }

  private pose(dt: number): void {
    this.group.position.set(this.x, this.y, -this.d);
    // 당한 횟수가 바뀌었을 때만 옷과 몸 상태를 다시 맞춘다.
    if (this.hits !== this.wear) {
      this.wear = this.hits;
      setHeroWear(this.model, this.hits);
      // 찢긴 옷자락처럼 새로 붙은 부품도 그림자를 드리우게 한다.
      castShadows(this.model);
    }
    this.group.visible = this.invulnT <= 0 || Math.floor(this.invulnT * 16) % 2 === 0;
    const p = this.pivot;
    if (this.state === 'fall') {
      p.rotation.x += dt * FALL_RATE * (this.y > 0 ? 14 : 6);
      p.position.y = this.y > 0 ? 0.9 : 0.35;
      // 땅에 닿은 뒤에는 누운 자세에서 멈춘다.
      if (this.y === 0 && this.fallT < 0.7) p.rotation.x = Math.PI / 2;
      swingPerson(this.model, performance.now() / 60, 1.2);
      return;
    }
    let rot = 0;
    let h = 0.9;
    if (this.hiding) {
      rot = -Math.PI / 2;
      h = 0.25;
    } else if (this.slideT > 0) {
      rot = 1.2;
      h = 0.35;
    }
    // 달릴 때는 몸을 앞으로 숙이고, 부스터를 쓰면 더 깊이 숙인다.
    if (rot === 0 && this.speed > 2) rot = this.boostT > 0 ? -0.5 : -0.2;
    // 발을 디딜 때마다 몸이 살짝 오르내린다.
    if (h === 0.9 && this.y === 0) h += Math.abs(Math.sin(this.runPhase)) * 0.06;
    p.rotation.x += (rot - p.rotation.x) * Math.min(1, dt * 18);
    p.position.y += (h - p.position.y) * Math.min(1, dt * 18);
    this.runPhase += dt * this.speed * 1.1;
    // 엎드려 길 때는 팔다리를 작게 젓는다.
    swingPerson(this.model, this.runPhase, this.y > 0 ? 0.3 : this.hiding ? 0.45 : this.speed > 0.5 ? 0.9 : 0);
    const { armL, armR, kneeL, kneeR, elbowL, elbowR } = this.model.userData.parts;
    // 뛰어오른 동안에는 무릎을 당겨 올린다.
    if (this.y > 0) kneeL.rotation.x = kneeR.rotation.x = -1.2;
    // 부스터로 질주할 때는 두 팔을 뒤로 쭉 뻗고 달린다.
    if (this.boosting) {
      armL.rotation.x = armR.rotation.x = -1.35;
      elbowL.rotation.x = elbowR.rotation.x = 0;
    }
  }
}

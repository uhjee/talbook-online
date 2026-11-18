import * as THREE from 'three';

interface Puff {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  vx: number;
  vy: number;
  vz: number;
  grow: number;
}

interface Bit {
  mesh: THREE.Mesh;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
}

/** 색종이 색: 주홍, 노랑, 크림, 민트, 하늘 */
const CONFETTI = [0xf0523a, 0xffd23f, 0xfff7e6, 0x6fbf9a, 0x7db9e4];

/** 달릴 때 발밑에서 이는 먼지와 넘어질 때 튀는 흙먼지, 결승의 폭죽 색종이를 그린다 */
export class Fx {
  private pool: Puff[] = [];
  private next = 0;
  private timer = 0;
  private sprayT = 0;
  private bits: Bit[] = [];
  private nextBit = 0;
  private scene: THREE.Scene;

  /**
   * 먼지 알갱이를 미리 만들어 둔다. 달리는 동안 새로 만들지 않고 돌려 쓴다.
   * @author heojeehaeng(claude)
   * @param {THREE.Scene} scene 게임 장면
   * @param {number} count 미리 만들 알갱이 수
   */
  constructor(scene: THREE.Scene, count = 64) {
    this.scene = scene;
    const geo = new THREE.SphereGeometry(1, 7, 5);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1 });
    }
  }

  /**
   * 먼지 알갱이 하나를 내보낸다.
   * @author heojeehaeng(claude)
   * @param {number} x 시작 x
   * @param {number} y 시작 높이
   * @param {number} z 시작 z
   * @param {number} color 색상
   * @param {number} size 처음 크기(m)
   * @param {number} life 사라질 때까지의 시간(초)
   * @param {number} spread 퍼지는 속도(m/s)
   */
  private emit(x: number, y: number, z: number, color: number, size: number, life: number, spread: number): void {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.setScalar(size);
    (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    p.mesh.visible = true;
    p.life = p.max = life;
    p.vx = (Math.random() - 0.5) * spread;
    p.vy = 0.4 + Math.random() * spread * 0.5;
    p.vz = (Math.random() - 0.2) * spread;
    p.grow = 1.5 + Math.random();
  }

  /**
   * 달리는 발밑에 먼지를 일정한 간격으로 뿌린다. 빠를수록 자주, 크게 뿌린다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   * @param {number} x 플레이어 x
   * @param {number} z 플레이어 z
   * @param {number} speed 달리는 속도(m/s)
   * @param {number} color 바닥에 어울리는 먼지 색
   */
  trail(dt: number, x: number, z: number, speed: number, color: number): void {
    this.timer -= dt;
    if (this.timer > 0 || speed < 6) return;
    const fast = speed > 30;
    this.timer = fast ? 0.025 : 0.07;
    this.emit(x + (Math.random() - 0.5) * 0.3, 0.12, z + 0.3, color, fast ? 0.26 : 0.16, fast ? 0.5 : 0.36, fast ? 2.2 : 1.1);
  }

  /**
   * 슬라이드로 미끄러지는 동안 몸 양옆으로 낮게 깔리는 흙먼지를 뿌린다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   * @param {number} x 플레이어 x
   * @param {number} z 플레이어 z
   * @param {number} color 바닥에 어울리는 먼지 색
   */
  spray(dt: number, x: number, z: number, color: number): void {
    this.sprayT -= dt;
    if (this.sprayT > 0) return;
    this.sprayT = 0.03;
    for (const side of [-1, 1]) this.emit(x + side * (0.35 + Math.random() * 0.2), 0.08, z + 0.4 + Math.random() * 0.5, color, 0.2, 0.42, 2.4);
  }

  /**
   * 넘어지거나 터졌을 때 흙먼지를 한꺼번에 터뜨린다.
   * @author heojeehaeng(claude)
   * @param {number} x 중심 x
   * @param {number} z 중심 z
   * @param {number} color 먼지 색
   * @param {number} count 알갱이 수
   */
  burst(x: number, z: number, color: number, count = 10): void {
    for (let i = 0; i < count; i++) this.emit(x, 0.3, z, color, 0.28, 0.55, 4.5);
  }

  /**
   * 폭죽 색종이를 터뜨린다. 위로 솟았다가 팔랑거리며 천천히 떨어진다.
   * @author heojeehaeng(claude)
   * @param {number} x 터지는 자리 x
   * @param {number} y 터지는 자리 높이
   * @param {number} z 터지는 자리 z
   * @param {number} count 색종이 수
   * @param {number} vx 쏠려 날아가는 방향의 x 속도(m/s)
   * @param {number} vz 쏠려 날아가는 방향의 z 속도(m/s)
   */
  confetti(x: number, y: number, z: number, count: number, vx = 0, vz = 0): void {
    // 결승에서만 쓰이므로 처음 터뜨릴 때 만든다.
    if (!this.bits.length) {
      const geo = new THREE.BoxGeometry(0.1, 0.012, 0.14);
      const mats = CONFETTI.map((color) => new THREE.MeshBasicMaterial({ color }));
      for (let i = 0; i < 160; i++) {
        const mesh = new THREE.Mesh(geo, mats[i % mats.length]);
        mesh.visible = false;
        this.scene.add(mesh);
        this.bits.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0, spin: 0 });
      }
    }
    for (let i = 0; i < count; i++) {
      const b = this.bits[this.nextBit];
      this.nextBit = (this.nextBit + 1) % this.bits.length;
      b.mesh.position.set(x, y, z);
      b.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.mesh.scale.setScalar(1);
      b.mesh.visible = true;
      b.life = 2.6 + Math.random() * 1.2;
      b.vx = vx * (0.4 + Math.random()) + (Math.random() - 0.5) * 3.2;
      b.vy = 4.2 + Math.random() * 3.6;
      b.vz = vz * (0.4 + Math.random()) + (Math.random() - 0.5) * 3.2;
      b.spin = 4 + Math.random() * 8;
    }
  }

  /**
   * 떠 있는 먼지를 움직이고 서서히 지운다. 색종이는 떨어뜨린다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   */
  update(dt: number): void {
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0 || b.mesh.position.y < 0.02) {
        b.life = 0;
        b.mesh.visible = false;
        continue;
      }
      // 종이라서 옆으로는 금방 느려지고, 떨어지는 속도도 일정 이상 빨라지지 않는다.
      b.vx *= 1 - Math.min(1, dt * 2.2);
      b.vz *= 1 - Math.min(1, dt * 2.2);
      b.vy = Math.max(-1.5, b.vy - 10 * dt);
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
      b.mesh.rotation.x += b.spin * dt;
      b.mesh.rotation.z += b.spin * 0.6 * dt;
      // 사라지기 직전에는 작아진다.
      if (b.life < 0.4) b.mesh.scale.setScalar(b.life / 0.4);
    }
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.multiplyScalar(1 + p.grow * dt);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (p.life / p.max);
    }
  }
}

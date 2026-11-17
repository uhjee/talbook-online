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

/** 달릴 때 발밑에서 이는 먼지와 넘어질 때 튀는 흙먼지를 그린다 */
export class Fx {
  private pool: Puff[] = [];
  private next = 0;
  private timer = 0;
  private sprayT = 0;

  /**
   * 먼지 알갱이를 미리 만들어 둔다. 달리는 동안 새로 만들지 않고 돌려 쓴다.
   * @author heojeehaeng(claude)
   * @param {THREE.Scene} scene 게임 장면
   * @param {number} count 미리 만들 알갱이 수
   */
  constructor(scene: THREE.Scene, count = 64) {
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
   * 떠 있는 먼지를 움직이고 서서히 지운다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   */
  update(dt: number): void {
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

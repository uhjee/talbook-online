import * as THREE from 'three';
import { COURSE_LEN, STAGES, stageAt } from './config';
import { box, isSharedMat } from './models';

const CHUNK = 50;
/** 구간 경계 앞뒤로 배경색을 섞는 거리(m) */
const BLEND = 15;

/** 바닥 질감 한 장이 덮는 길이(m) */
const TILE = 16;

/**
 * 바닥에 까는 질감을 그린다. 단색 바닥에 얼룩과 알갱이를 뿌려 밋밋함을 없앤다.
 * @author heojeehaeng(claude)
 * @param {number} color 바탕색
 * @param {string} kind plain(얼룩만), grass(풀), dirt(흙길), city(중앙선 있는 도로), base(가장자리 선 있는 도로)
 * @return {THREE.CanvasTexture} 반복해서 깔 수 있는 질감
 */
function surfaceTexture(color: number, kind: 'plain' | 'grass' | 'dirt' | 'city' | 'base'): THREE.CanvasTexture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const base = new THREE.Color(color);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, size, size);
  // 시드가 고정된 난수를 써서 새로 그려도 같은 무늬가 나오게 한다.
  let seed = color % 9973;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const shade = (k: number) => `#${base.clone().multiplyScalar(k).getHexString()}`;
  const dots = kind === 'grass' ? 900 : 420;
  for (let i = 0; i < dots; i++) {
    g.fillStyle = shade(0.82 + rnd() * 0.36);
    const r = kind === 'grass' ? 1 + rnd() * 2 : 1 + rnd() * 5;
    g.globalAlpha = 0.5;
    g.fillRect(rnd() * size, rnd() * size, r, kind === 'grass' ? r * 3 : r);
  }
  g.globalAlpha = 1;
  if (kind === 'dirt') {
    // 바퀴 자국
    g.fillStyle = shade(0.86);
    g.globalAlpha = 0.5;
    g.fillRect(size * 0.3, 0, size * 0.06, size);
    g.fillRect(size * 0.64, 0, size * 0.06, size);
    g.globalAlpha = 1;
  }
  if (kind === 'city' || kind === 'base') {
    g.fillStyle = '#e9e6dc';
    g.fillRect(size * 0.03, 0, size * 0.015, size);
    g.fillRect(size * 0.955, 0, size * 0.015, size);
    if (kind === 'city') {
      g.fillStyle = '#e3c341';
      g.fillRect(size * 0.492, size * 0.1, size * 0.016, size * 0.4);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export interface Env {
  sky: THREE.Color;
  top: THREE.Color;
  fogNear: number;
  fogFar: number;
  light: number;
}

export class World {
  private chunks = new Map<number, THREE.Group>();
  private always = new THREE.Group();
  /** 적과 장애물은 다시 배치할 때 통째로 지울 수 있도록 배경 소품과 따로 묶는다 */
  private entChunks = new Map<number, THREE.Group>();
  private entAlways = new THREE.Group();
  private env: Env = { sky: new THREE.Color(), top: new THREE.Color(), fogNear: 10, fogFar: 100, light: 1 };
  private tmp = new THREE.Color();

  /**
   * 구간별 바닥과 탄광 갱도를 만들어 장면에 넣는다.
   * @author heojeehaeng(claude)
   * @param {THREE.Scene} scene 게임 장면
   */
  constructor(private scene: THREE.Scene) {
    scene.add(this.always, this.entAlways);
    for (const s of STAGES) {
      // 출발점 뒤와 결승점 너머에도 바닥이 보이도록 양 끝 구간을 늘린다.
      const from = s.id === 'mine' ? -30 : s.from;
      const len = s.to - from + (s.id === 'ss' ? 60 : 0);
      const mid = -(from + len / 2);
      const groundTex = surfaceTexture(s.ground, s.id === 'dmz' ? 'grass' : 'plain');
      groundTex.repeat.set(160 / TILE, len / TILE);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, len), new THREE.MeshLambertMaterial({ map: groundTex }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.03, mid);
      const roadTex = surfaceTexture(s.road, s.id === 'city' ? 'city' : s.id === 'ss' ? 'base' : 'dirt');
      roadTex.repeat.set(1, len / TILE);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(8.6, len), new THREE.MeshLambertMaterial({ map: roadTex }));
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0, mid);
      scene.add(ground, road);
    }
    this.buildMine();
  }

  /**
   * 탄광 갱도의 벽, 천장, 받침목, 반딧불 등불을 만든다.
   * @author heojeehaeng(claude)
   */
  private buildMine(): void {
    const len = STAGES[0].to;
    for (const sx of [-1, 1]) this.scene.add(box(1, 5.4, len + 30, 0x241a13, sx * 5.3, 2.7, -len / 2 + 15));
    this.scene.add(box(11.6, 0.6, len + 30, 0x1c140e, 0, 5.4, -len / 2 + 15));
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xd8ff7a });
    for (let d = 6; d < len; d += 12.5) {
      const frame = new THREE.Group();
      frame.add(box(0.35, 4.8, 0.35, 0x6b4a2b, -4.6, 2.4, 0), box(0.35, 4.8, 0.35, 0x6b4a2b, 4.6, 2.4, 0));
      frame.add(box(9.6, 0.35, 0.35, 0x6b4a2b, 0, 4.8, 0));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), lampMat);
      lamp.position.set(d % 25 < 12.5 ? -3.2 : 3.2, 4.1, 0);
      frame.add(lamp, box(0.03, 0.5, 0.03, 0x111111, lamp.position.x, 4.45, 0));
      frame.position.z = -d;
      this.add(frame, d);
    }
    // 광차 레일
    for (const rx of [-2, 0, 2]) for (const o of [-0.35, 0.35]) this.scene.add(box(0.06, 0.05, len, 0x8a8f94, rx + o, 0.03, -len / 2));
  }

  /**
   * 물체를 거리별 묶음에 넣는다. 멀리 있는 묶음은 그리지 않는다.
   * @author heojeehaeng(claude)
   * @param {THREE.Object3D} obj 넣을 물체 (월드 좌표로 배치된 상태)
   * @param {number} d 물체가 놓인 거리(m)
   * @param {boolean} always true면 거리와 상관없이 항상 그린다 (움직이는 물체용)
   */
  add(obj: THREE.Object3D, d: number, always = false): void {
    this.place(this.chunks, this.always, obj, d, always);
  }

  /**
   * 적이나 장애물을 거리별 묶음에 넣는다. clearEntities로 한꺼번에 지울 수 있다.
   * @author heojeehaeng(claude)
   * @param {THREE.Object3D} obj 넣을 물체 (월드 좌표로 배치된 상태)
   * @param {number} d 물체가 놓인 거리(m)
   * @param {boolean} always true면 거리와 상관없이 항상 그린다 (움직이는 물체용)
   */
  addEntity(obj: THREE.Object3D, d: number, always = false): void {
    this.place(this.entChunks, this.entAlways, obj, d, always);
  }

  private place(map: Map<number, THREE.Group>, alwaysGroup: THREE.Group, obj: THREE.Object3D, d: number, always: boolean): void {
    if (always) {
      alwaysGroup.add(obj);
      return;
    }
    const idx = Math.floor(Math.max(0, Math.min(COURSE_LEN + 40, d)) / CHUNK);
    let g = map.get(idx);
    if (!g) {
      g = new THREE.Group();
      map.set(idx, g);
      this.scene.add(g);
    }
    g.add(obj);
  }

  /**
   * 배치된 적과 장애물을 모두 지우고 그래픽 메모리를 해제한다.
   * @author heojeehaeng(claude)
   */
  clearEntities(): void {
    const free = (root: THREE.Object3D) =>
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        // 캐릭터들이 함께 쓰는 기본 도형은 다시 쓰이므로 해제하지 않는다.
        if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
        const mt = mesh.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined;
        // 색상별로 함께 쓰는 재질은 남겨 두고, 물체마다 따로 만든 재질과 텍스처만 해제한다.
        if (mt && !Array.isArray(mt) && !isSharedMat(mt)) {
          mt.map?.dispose();
          mt.dispose();
        }
      });
    for (const g of this.entChunks.values()) {
      free(g);
      this.scene.remove(g);
    }
    this.entChunks.clear();
    free(this.entAlways);
    this.entAlways.clear();
  }

  /**
   * 플레이어 주변의 묶음만 보이게 한다.
   * @author heojeehaeng(claude)
   * @param {number} pd 플레이어가 달린 거리(m)
   */
  update(pd: number): void {
    for (const map of [this.chunks, this.entChunks]) {
      for (const [idx, g] of map) {
        const from = idx * CHUNK;
        g.visible = from + CHUNK > pd - 25 && from < pd + 210;
      }
    }
  }

  /**
   * 현재 거리의 하늘색, 안개, 조명 밝기를 반환한다. 구간 경계에서는 두 구간 값을 섞는다.
   * @author heojeehaeng(claude)
   * @param {number} d 플레이어가 달린 거리(m)
   * @return {Env} 배경 환경 값
   */
  envAt(d: number): Env {
    const s = stageAt(d);
    const i = STAGES.indexOf(s);
    let other = s;
    let k = 0;
    if (i > 0 && d - s.from < BLEND) {
      other = STAGES[i - 1];
      k = 0.5 - (d - s.from) / (BLEND * 2);
    } else if (i < STAGES.length - 1 && s.to - d < BLEND) {
      other = STAGES[i + 1];
      k = 0.5 - (s.to - d) / (BLEND * 2);
    }
    const e = this.env;
    e.sky.setHex(s.sky).lerp(this.tmp.setHex(other.sky), k);
    e.top.setHex(s.skyTop).lerp(this.tmp.setHex(other.skyTop), k);
    e.fogNear = s.fogNear + (other.fogNear - s.fogNear) * k;
    e.fogFar = s.fogFar + (other.fogFar - s.fogFar) * k;
    e.light = s.light + (other.light - s.light) * k;
    return e;
  }
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './models';

/** 묶음 하나가 덮는 거리(m). world.ts의 묶음 크기와 같아야 한다 */
const CHUNK = 50;

/** 불러올 배경 모델. 폴더 이름별 파일 목록이다 (Kenney의 CC0 에셋) */
const MODELS: Record<string, string[]> = {
  nature: [
    'tree_pineDefaultA', 'tree_pineDefaultB', 'tree_pineTallA', 'tree_pineRoundC', 'tree_oak', 'tree_default',
    'rock_largeA', 'rock_largeB', 'rock_tallB', 'stone_tallC', 'plant_bush', 'plant_bushLarge', 'grass_large',
    'flower_redA', 'flower_yellowA', 'mushroom_redGroup', 'log_stack', 'stump_old',
  ],
  commercial: [
    'building-a', 'building-c', 'building-e', 'building-g', 'building-k', 'building-n', 'building-skyscraper-a',
    'building-skyscraper-c', 'low-detail-building-a', 'low-detail-building-b', 'low-detail-building-f', 'low-detail-building-wide-a',
  ],
  industrial: [
    'building-a', 'building-h', 'building-p', 'chimney-large', 'chimney-basic', 'detail-tank-large',
    'shipping-container-a', 'shipping-container-b', 'water-tower',
  ],
  survival: [
    'barrel', 'box', 'box-large', 'bucket', 'fence-fortified', 'tent-canvas', 'tool-pickaxe', 'tool-shovel',
    'resource-stone-large', 'resource-planks', 'structure-metal', 'workbench', 'rock-a', 'rock-b',
  ],
};

interface Baked {
  geo: THREE.BufferGeometry;
  /** 모델의 원래 높이, 폭, 깊이 */
  size: THREE.Vector3;
}

const baked = new Map<string, Baked>();
const pixelCache = new Map<unknown, ImageData>();
let material: THREE.MeshToonMaterial | null = null;

/**
 * 배경 모델을 모두 불러와 게임에서 쓰는 형태로 바꿔 둔다. 실패한 모델은 건너뛰고 끝까지 진행한다.
 * @author heojeehaeng(claude)
 * @param {Function} onProgress 진행 상황을 받는 함수 (끝난 개수, 전체 개수)
 * @return {Promise<void>} 모든 모델을 시도한 뒤 끝나는 약속
 */
export async function loadProps(onProgress?: (done: number, total: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  const jobs: Promise<void>[] = [];
  const total = Object.values(MODELS).reduce((n, list) => n + list.length, 0);
  let done = 0;
  for (const [dir, names] of Object.entries(MODELS)) {
    for (const name of names) {
      jobs.push(
        loader
          .loadAsync(`models/${dir}/${name}.glb`)
          .then((gltf) => {
            const b = bake(gltf.scene);
            if (b) baked.set(`${dir}/${name}`, b);
          })
          // 모델 하나를 못 받아도 게임은 시작할 수 있어야 하므로 오류는 삼킨다.
          .catch(() => undefined)
          .then(() => onProgress?.(++done, total)),
      );
    }
  }
  await Promise.all(jobs);
}

/**
 * 배경 모델을 하나라도 불러왔는지 반환한다. 못 불러왔으면 기본 도형 배경으로 대신한다.
 * @author heojeehaeng(claude)
 * @return {boolean} 배경 모델 사용 가능 여부
 */
export function hasProps(): boolean {
  return baked.size > 0;
}

/**
 * 불러온 모델을 꼭짓점 색만 가진 도형 하나로 굽는다.
 * 팩마다 색을 넣는 방식(재질 색, 색상표 그림)이 달라서, 모두 꼭짓점 색으로 바꿔 캐릭터와 같은 만화풍 재질 하나로 그린다.
 * @author heojeehaeng(claude)
 * @param {THREE.Object3D} root 불러온 모델
 * @return {Baked|null} 구운 도형과 크기. 그릴 것이 없으면 null
 */
function bake(root: THREE.Object3D): Baked | null {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    src.applyMatrix4(mesh.matrixWorld);
    if (!src.attributes.normal) src.computeVertexNormals();
    const m = mesh.material as THREE.MeshStandardMaterial;
    const px = m.map ? pixels(m.map) : null;
    const uv = src.attributes.uv as THREE.BufferAttribute | undefined;
    const n = src.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c.copy(m.color);
      if (px && uv) {
        // 색상표 그림에서 이 꼭짓점이 가리키는 칸의 색을 읽는다. glTF는 그림 위쪽이 v=0이다.
        const u = uv.getX(i) - Math.floor(uv.getX(i));
        const v = uv.getY(i) - Math.floor(uv.getY(i));
        const k = (Math.min(px.height - 1, Math.floor(v * px.height)) * px.width + Math.min(px.width - 1, Math.floor(u * px.width))) * 4;
        c.multiply(tmp.setRGB(px.data[k] / 255, px.data[k + 1] / 255, px.data[k + 2] / 255, THREE.SRGBColorSpace));
      }
      grade(c);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position);
    g.setAttribute('normal', src.attributes.normal);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  });
  if (!parts.length) return null;
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (!geo) return null;
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  // 바닥 가운데가 원점이 되도록 옮겨서 놓는 위치가 곧 땅에 닿는 자리가 되게 한다.
  geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geo.userData.shared = true;
  return { geo, size: box.getSize(new THREE.Vector3()) };
}

const tmp = new THREE.Color();
const hsl = { h: 0, s: 0, l: 0 };

/**
 * 받아 온 모델의 색을 이 게임의 색감에 맞춘다. 원본은 밝은 파스텔 색이라 그대로 쓰면 캐릭터와 바닥보다 떠 보인다.
 * 전체를 어둡게 하고, 청록에 가까운 잎은 풀밭과 같은 녹색 쪽으로 옮기고, 붉은 기가 도는 바위와 나무는 채도를 낮춘다.
 * @author heojeehaeng(claude)
 * @param {THREE.Color} c 고칠 색. 제자리에서 바꾼다
 */
function grade(c: THREE.Color): void {
  c.getHSL(hsl, THREE.SRGBColorSpace);
  // 채도가 낮은 회색 돌은 잎이 아니므로 녹색으로 옮기지 않는다.
  const teal = hsl.h > 0.36 && hsl.h < 0.55 && hsl.s > 0.3;
  const warm = hsl.h < 0.12 || hsl.h > 0.94;
  if (teal) hsl.h = 0.27 + (hsl.h - 0.36) * 0.35;
  c.setHSL(hsl.h, hsl.s * (warm ? 0.38 : teal ? 0.7 : 0.85), hsl.l * (teal ? 0.6 : warm ? 0.62 : 0.72), THREE.SRGBColorSpace);
}

/**
 * 텍스처 그림의 픽셀 값을 읽어 온다. 같은 그림은 한 번만 읽는다.
 * @author heojeehaeng(claude)
 * @param {THREE.Texture} map 텍스처
 * @return {ImageData|null} 픽셀 값. 읽을 수 없으면 null
 */
function pixels(map: THREE.Texture): ImageData | null {
  const img = map.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img) return null;
  let data = pixelCache.get(img);
  if (!data) {
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const g = cv.getContext('2d')!;
    g.drawImage(img, 0, 0);
    data = g.getImageData(0, 0, cv.width, cv.height);
    pixelCache.set(img, data);
  }
  return data;
}

export interface PutOpts {
  /** 맞출 높이(m). 모델을 이 높이가 되도록 고르게 키운다 */
  h?: number;
  /** 맞출 폭(m). h 대신 폭 기준으로 키울 때 쓴다 */
  w?: number;
  /** y축 회전(rad) */
  ry?: number;
  /** 바닥에서 띄우는 높이(m) */
  y?: number;
  /** 곱할 색. 구간 분위기에 맞춰 채도와 밝기를 낮출 때 쓴다 */
  tint?: number;
  /** 앞으로 기울이는 각도(rad). 벽에 기대 세운 도구에 쓴다 */
  lean?: number;
}

interface Group {
  key: string;
  chunk: number;
  mats: THREE.Matrix4[];
  tints: number[];
}

/** 배경 모델을 길 따라 뿌린 뒤, 같은 모델끼리 묶어 한 번에 그리는 물체로 만든다 */
export class Scatter {
  private groups = new Map<string, Group>();
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private euler = new THREE.Euler();

  /**
   * 모델 하나를 놓을 자리를 적어 둔다. 실제 물체는 build에서 만든다.
   * @author heojeehaeng(claude)
   * @param {string} key 모델 이름 ('폴더/파일')
   * @param {number} x 놓을 x
   * @param {number} d 놓을 거리(m)
   * @param {PutOpts} o 크기, 회전, 색
   * @return {boolean} 모델이 있어 자리를 적었는지 여부
   */
  put(key: string, x: number, d: number, o: PutOpts = {}): boolean {
    const b = baked.get(key);
    if (!b) return false;
    const s = o.h !== undefined ? o.h / b.size.y : o.w !== undefined ? o.w / b.size.x : 1;
    this.pos.set(x, o.y ?? 0, -d);
    this.quat.setFromEuler(this.euler.set(o.lean ?? 0, o.ry ?? 0, 0, 'YXZ'));
    this.scale.setScalar(s);
    const chunk = Math.floor(Math.max(0, d) / CHUNK);
    const id = `${key}@${chunk}`;
    let g = this.groups.get(id);
    if (!g) {
      g = { key, chunk, mats: [], tints: [] };
      this.groups.set(id, g);
    }
    g.mats.push(new THREE.Matrix4().compose(this.pos, this.quat, this.scale));
    g.tints.push(o.tint ?? 0xffffff);
    return true;
  }

  /**
   * 적어 둔 자리들을 거리 묶음별, 모델별로 한 번에 그리는 물체로 만들어 넘긴다.
   * 같은 모델 수백 개를 따로 그리면 느려지므로 묶음마다 모델당 한 번만 그리게 한다.
   * @author heojeehaeng(claude)
   * @param {Function} add 만든 물체를 장면에 넣는 함수 (물체, 거리)
   */
  build(add: (obj: THREE.Object3D, d: number) => void): void {
    if (!material) {
      material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(0xffffff).gradientMap });
      material.userData.shared = true;
    }
    const c = new THREE.Color();
    for (const g of this.groups.values()) {
      const mesh = new THREE.InstancedMesh(baked.get(g.key)!.geo, material, g.mats.length);
      g.mats.forEach((m, i) => {
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(g.tints[i]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      // 보일지 말지는 거리 묶음이 정하므로 물체마다 다시 따지지 않는다.
      mesh.frustumCulled = false;
      add(mesh, g.chunk * CHUNK + CHUNK / 2);
    }
    this.groups.clear();
  }
}

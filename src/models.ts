import * as THREE from 'three';

const mats = new Map<number, THREE.MeshLambertMaterial>();

/**
 * 색상별 재질을 재사용하여 반환한다.
 * @author heojeehaeng(claude)
 * @param {number} color 16진수 색상
 * @return {THREE.MeshLambertMaterial} 재질
 */
export function mat(color: number): THREE.MeshLambertMaterial {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    mats.set(color, m);
  }
  return m;
}

/**
 * 여러 물체가 함께 쓰는 재질인지 확인한다. 함께 쓰는 재질은 물체를 지울 때 해제하면 안 된다.
 * @author heojeehaeng(claude)
 * @param {THREE.Material} material 확인할 재질
 * @return {boolean} 함께 쓰는 재질 여부
 */
export function isSharedMat(material: THREE.Material): boolean {
  if (material.userData.shared) return true;
  for (const v of mats.values()) if (v === material) return true;
  return false;
}

const bubbleMats = new Map<string, THREE.MeshBasicMaterial>();

/**
 * 머리 위에 띄우는 말풍선을 만든다. 같은 대사는 재질과 글자 그림을 함께 써서, 적을 다시 배치할 때마다 새로 그리지 않는다.
 * @author heojeehaeng(claude)
 * @param {string} text 말풍선에 넣을 대사
 * @return {THREE.Mesh} 말풍선. 글자는 +z 방향을 향한다
 */
export function makeBubble(text: string): THREE.Mesh {
  const w = Math.min(7.4, 0.5 * text.length + 1.0);
  const h = 1.08;
  let material = bubbleMats.get(text);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ map: textTexture(text, Math.round((256 * w) / h), 256, '#ffffff', '#b3261e'), side: THREE.DoubleSide });
    material.userData.shared = true;
    bubbleMats.set(text, material);
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
}

/**
 * 상자 모양 메시를 만든다.
 * @author heojeehaeng(claude)
 * @param {number} w 가로
 * @param {number} h 세로
 * @param {number} d 깊이
 * @param {number} color 색상
 * @param {number} x 중심 x
 * @param {number} y 중심 y
 * @param {number} z 중심 z
 * @return {THREE.Mesh} 상자 메시
 */
export function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

/**
 * 글자를 그린 캔버스 텍스처를 만든다. 줄 수와 글자 수에 맞춰 글자 크기를 정한다.
 * @author heojeehaeng(claude)
 * @param {string} text 표시할 글(줄바꿈은 \n)
 * @param {number} wpx 캔버스 가로(px)
 * @param {number} hpx 캔버스 세로(px)
 * @param {string|null} bg 배경색. null이면 투명
 * @param {string} fg 글자색
 * @return {THREE.CanvasTexture} 텍스처
 */
export function textTexture(text: string, wpx: number, hpx: number, bg: string | null, fg: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = wpx;
  cv.height = hpx;
  const g = cv.getContext('2d')!;
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, wpx, hpx);
    g.strokeStyle = fg;
    g.lineWidth = Math.max(4, hpx * 0.03);
    g.strokeRect(0, 0, wpx, hpx);
  }
  const lines = text.split('\n');
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.floor(Math.min((hpx * 0.86) / (lines.length * 1.3), (wpx * 0.9) / (longest * 1.02)));
  g.fillStyle = fg;
  g.font = `bold ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, wpx / 2, hpx / 2 + (i - (lines.length - 1) / 2) * size * 1.3));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 기둥에 달린 표지판을 만든다. 글자는 달려오는 플레이어 쪽(+z)을 향한다.
 * @author heojeehaeng(claude)
 * @param {string} text 표지판 글
 * @param {number} w 판 가로(m)
 * @param {number} h 판 세로(m)
 * @param {string} bg 배경색
 * @param {string} fg 글자색
 * @param {number} post 기둥 높이(m). 0이면 기둥이 없다
 * @return {THREE.Group} 표지판
 */
export function makeSign(text: string, w: number, h: number, bg = '#f4f0e6', fg = '#222222', post = 1.3): THREE.Group {
  const g = new THREE.Group();
  const px = 256;
  const tex = textTexture(text, Math.round(px * Math.max(1, w / h)), Math.round(px * Math.max(1, h / w)), bg, fg);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  plane.position.y = post + h / 2;
  g.add(plane);
  if (post > 0) g.add(box(0.12, post, 0.12, 0x5b4a3a, 0, post / 2, -0.07));
  return g;
}

/**
 * 캔버스에 그린 그림을 얇은 입간판으로 만든다. 뒤에 받침 각목을 붙인다.
 * @author heojeehaeng(claude)
 * @param {Function} draw 캔버스에 그림을 그리는 함수 (g, 가로px, 세로px)
 * @param {number} w 입간판 가로(m)
 * @param {number} h 입간판 세로(m)
 * @return {THREE.Group} 입간판
 */
export function makeCutout(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): THREE.Group {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = Math.round((256 * h) / w);
  draw(cv.getContext('2d')!, cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  );
  plane.position.y = h / 2;
  g.add(plane);
  for (const sx of [-w * 0.25, w * 0.25]) {
    const stick = box(0.18, h * 0.8, 0.18, 0x8a6a45, sx, h * 0.35, -h * 0.18);
    stick.rotation.x = -0.5;
    g.add(stick);
  }
  return g;
}

export interface PersonOpts {
  shirt: number;
  pants: number;
  skin?: number;
  hat?: number;
  /** 모자 대신 냄비를 쓴다 */
  pot?: boolean;
}

/**
 * 머리가 큰 2.5등신 사람 모델을 만든다. 기본 방향은 -z(달리는 방향)이다.
 * @author heojeehaeng(claude)
 * @param {PersonOpts} o 옷과 모자 색상
 * @return {THREE.Group} 사람 모델. userData.parts에 팔다리 관절이 들어 있다
 */
export function makePerson(o: PersonOpts): THREE.Group {
  const g = new THREE.Group();
  const skin = o.skin ?? 0xf1c9a5;
  const limb = (color: number, x: number, y: number, len: number, w: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(box(w, len, w + 0.02, color, 0, -len / 2, 0));
    g.add(pivot);
    return pivot;
  };
  const legL = limb(o.pants, -0.14, 0.5, 0.5, 0.2);
  const legR = limb(o.pants, 0.14, 0.5, 0.5, 0.2);
  g.add(box(0.56, 0.6, 0.34, o.shirt, 0, 0.8, 0));
  const armL = limb(o.shirt, -0.37, 1.05, 0.5, 0.15);
  const armR = limb(o.shirt, 0.37, 1.05, 0.5, 0.15);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat(skin));
  head.position.y = 1.5;
  g.add(head);
  g.add(box(0.08, 0.1, 0.05, 0x222222, -0.15, 1.55, -0.4));
  g.add(box(0.08, 0.1, 0.05, 0x222222, 0.15, 1.55, -0.4));
  if (o.pot) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.3, 12), mat(0x9aa0a6));
    pot.position.y = 1.9;
    g.add(pot, box(0.3, 0.05, 0.08, 0x9aa0a6, 0.5, 1.95, 0));
  } else if (o.hat !== undefined) {
    g.add(box(0.7, 0.16, 0.7, o.hat, 0, 1.9, 0), box(0.5, 0.06, 0.3, o.hat, 0, 1.85, -0.45));
  }
  g.userData.parts = { legL, legR, armL, armR, head };
  return g;
}

/**
 * 사람 모델의 팔다리를 달리기 박자에 맞춰 흔든다.
 * @author heojeehaeng(claude)
 * @param {THREE.Group} p makePerson으로 만든 모델
 * @param {number} phase 흔들림 위상(rad)
 * @param {number} amp 흔들림 크기(rad)
 */
export function swingPerson(p: THREE.Group, phase: number, amp: number): void {
  const { legL, legR, armL, armR } = p.userData.parts;
  const s = Math.sin(phase) * amp;
  legL.rotation.x = s;
  legR.rotation.x = -s;
  armL.rotation.x = -s;
  armR.rotation.x = s;
}

/**
 * 곰 모델을 만든다. 건빵 봉지를 들고 있다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 곰 모델
 */
export function makeBear(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.5, 1.3, 1.2, 0x6b4423, 0, 0.75, 0));
  g.add(box(0.9, 0.8, 0.8, 0x6b4423, 0, 1.75, 0.15));
  g.add(box(0.4, 0.3, 0.3, 0xd9b38c, 0, 1.6, 0.6));
  g.add(box(0.25, 0.25, 0.15, 0x6b4423, -0.35, 2.2, 0.15), box(0.25, 0.25, 0.15, 0x6b4423, 0.35, 2.2, 0.15));
  g.add(box(0.1, 0.1, 0.05, 0x111111, -0.2, 1.9, 0.56), box(0.1, 0.1, 0.05, 0x111111, 0.2, 1.9, 0.56));
  g.add(box(0.5, 0.6, 0.2, 0xd8c690, 0.75, 0.9, 0.6));
  // 베어허그를 하려고 양옆으로 벌린 앞발
  const arms = new THREE.Group();
  arms.add(box(1.3, 0.4, 0.45, 0x6b4423, -1.35, 1.25, 0.2), box(1.3, 0.4, 0.45, 0x6b4423, 1.35, 1.25, 0.2));
  arms.add(box(0.35, 0.5, 0.5, 0x4a2f18, -2.05, 1.25, 0.35), box(0.35, 0.5, 0.5, 0x4a2f18, 2.05, 1.25, 0.35));
  g.add(arms);
  g.userData.arms = arms;
  return g;
}

/**
 * 고양이 모델을 만든다. 머리는 +x 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 고양이 모델
 */
export function makeCat(): THREE.Group {
  const g = new THREE.Group();
  const col = 0x8f9399;
  g.add(box(0.8, 0.32, 0.3, col, 0, 0.36, 0), box(0.34, 0.32, 0.34, col, 0.5, 0.52, 0));
  g.add(box(0.08, 0.14, 0.08, col, 0.42, 0.74, -0.1), box(0.08, 0.14, 0.08, col, 0.42, 0.74, 0.1));
  for (const lx of [-0.28, 0.28]) for (const lz of [-0.1, 0.1]) g.add(box(0.08, 0.22, 0.08, col, lx, 0.11, lz));
  const tail = box(0.07, 0.5, 0.07, col, -0.45, 0.65, 0);
  tail.rotation.z = 0.4;
  g.add(tail);
  return g;
}

/**
 * 고라니 모델을 만든다. 머리는 +z(달려오는 플레이어 쪽) 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 고라니 모델
 */
export function makeDeer(): THREE.Group {
  const g = new THREE.Group();
  const col = 0x9c7a4d;
  g.add(box(0.45, 0.55, 1.1, col, 0, 0.85, 0), box(0.3, 0.35, 0.4, col, 0, 1.25, 0.65));
  g.add(box(0.06, 0.25, 0.06, col, -0.12, 1.52, 0.6), box(0.06, 0.25, 0.06, col, 0.12, 1.52, 0.6));
  // 고라니는 뿔 대신 송곳니가 있다.
  g.add(box(0.04, 0.14, 0.04, 0xffffff, -0.08, 1.05, 0.84), box(0.04, 0.14, 0.04, 0xffffff, 0.08, 1.05, 0.84));
  const legs: THREE.Mesh[] = [];
  for (const lx of [-0.16, 0.16]) {
    for (const lz of [-0.4, 0.4]) {
      const leg = box(0.1, 0.6, 0.1, col, lx, 0.3, lz);
      legs.push(leg);
      g.add(leg);
    }
  }
  g.userData.legs = legs;
  return g;
}

/**
 * 민화풍 호랑이 모델을 만든다. 까치 한 마리가 위에서 따라다닌다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 호랑이 모델. 머리는 +x 방향이다
 */
export function makeTiger(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.9, 0.7, 0.7, 0xe8962e, 0, 0.75, 0));
  for (const sx of [-0.5, 0, 0.5]) g.add(box(0.14, 0.72, 0.72, 0x222222, sx, 0.75, 0));
  g.add(box(0.75, 0.75, 0.8, 0xe8962e, 1.15, 1.0, 0));
  g.add(box(0.1, 0.4, 0.5, 0xfff3d6, 1.54, 0.9, 0));
  g.add(box(0.06, 0.12, 0.12, 0x111111, 1.55, 1.2, -0.2), box(0.06, 0.12, 0.12, 0x111111, 1.55, 1.2, 0.2));
  for (const lx of [-0.7, 0.7]) for (const lz of [-0.25, 0.25]) g.add(box(0.2, 0.45, 0.2, 0xe8962e, lx, 0.22, lz));
  g.add(box(0.7, 0.12, 0.12, 0xe8962e, -1.25, 1.0, 0));
  const magpie = new THREE.Group();
  magpie.add(box(0.35, 0.2, 0.2, 0x111111), box(0.2, 0.1, 0.18, 0xffffff, 0, -0.08, 0));
  magpie.position.set(0.4, 2.1, 0);
  g.add(magpie);
  g.userData.magpie = magpie;
  return g;
}

/**
 * 기린 모델을 만든다. 목은 userData.neck 관절로 휘두르며, 보따리를 매고 있다.
 * @author heojeehaeng(claude)
 * @param {number} neckLen 목 길이(m)
 * @return {THREE.Group} 기린 모델
 */
export function makeGiraffe(neckLen: number): THREE.Group {
  const g = new THREE.Group();
  const col = 0xe3b23c;
  for (const lx of [-0.4, 0.4]) for (const lz of [-0.6, 0.6]) g.add(box(0.2, 1.2, 0.2, col, lx, 0.6, lz));
  g.add(box(1.1, 0.8, 1.7, col, 0, 1.55, 0));
  const neck = new THREE.Group();
  neck.position.set(0, 1.55, 0);
  neck.add(box(neckLen, 0.32, 0.32, col, neckLen / 2, 0, 0));
  for (let i = 1; i < neckLen; i += 1.4) neck.add(box(0.3, 0.34, 0.34, 0x9c6b1e, i, 0, 0));
  neck.add(box(0.8, 0.45, 0.45, col, neckLen + 0.3, 0, 0));
  neck.add(box(0.08, 0.3, 0.08, 0x9c6b1e, neckLen + 0.2, 0.35, 0.12), box(0.08, 0.3, 0.08, 0x9c6b1e, neckLen + 0.2, 0.35, -0.12));
  const bundle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), mat(0xc0392b));
  bundle.position.set(neckLen * 0.45, -0.45, 0);
  neck.add(bundle);
  g.add(neck);
  g.userData.neck = neck;
  return g;
}

/**
 * 장군이 타는 폭이 넓고 긴 검은 리무진 모델을 만든다. 앞은 +z(달려오는 플레이어 쪽) 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 리무진 모델
 */
export function makeLimo(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3.4, 0.9, 9.5, 0x0d0d0f, 0, 0.75, 0), box(3.0, 0.7, 5.6, 0x16161a, 0, 1.5, -0.6));
  g.add(box(3.05, 0.42, 5.1, 0x3a4656, 0, 1.55, -0.6), box(2.4, 0.45, 0.1, 0xc8c8c8, 0, 0.75, 4.78));
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });
  for (const sx of [-1.35, 1.35]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.08), lamp);
    light.position.set(sx, 0.85, 4.78);
    g.add(light);
    // 앞 범퍼 양쪽의 장군 깃발
    g.add(box(0.05, 0.9, 0.05, 0xcfcfcf, sx, 1.65, 4.5), box(0.5, 0.32, 0.03, 0xc00000, sx + 0.27, 1.92, 4.5));
    for (const wz of [-3.4, 0, 3.4]) g.add(box(0.35, 0.8, 0.9, 0x1e1e1e, sx * 1.22, 0.4, wz));
  }
  const plate = makeSign('★★★★', 1.5, 0.42, '#c00000', '#ffd700', 0);
  plate.position.set(0, 0.12, 4.82);
  g.add(plate);
  return g;
}

/**
 * 멧돼지 모델을 만든다. 머리는 +z(달려오는 플레이어 쪽) 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 멧돼지 모델. userData.legs에 다리가 들어 있다
 */
export function makeBoar(): THREE.Group {
  const g = new THREE.Group();
  const col = 0x4a3b30;
  g.add(box(0.95, 0.85, 1.6, col, 0, 0.8, 0), box(0.7, 0.65, 0.7, col, 0, 0.75, 1.0));
  g.add(box(0.36, 0.3, 0.28, 0x7a5c50, 0, 0.62, 1.42), box(0.2, 0.22, 1.5, 0x2a2018, 0, 1.3, 0));
  g.add(box(0.06, 0.24, 0.06, 0xfff3d6, -0.24, 0.7, 1.4), box(0.06, 0.24, 0.06, 0xfff3d6, 0.24, 0.7, 1.4));
  g.add(box(0.08, 0.08, 0.04, 0x111111, -0.2, 0.92, 1.36), box(0.08, 0.08, 0.04, 0x111111, 0.2, 0.92, 1.36));
  const legs: THREE.Mesh[] = [];
  for (const lx of [-0.3, 0.3]) {
    for (const lz of [-0.55, 0.55]) {
      const leg = box(0.16, 0.45, 0.16, col, lx, 0.22, lz);
      legs.push(leg);
      g.add(leg);
    }
  }
  g.userData.legs = legs;
  return g;
}

/**
 * 엄지를 치켜든 육군 마스코트 '굳건이' 모델을 만든다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 마스코트 모델. 기본 방향은 -z이다
 */
export function makeMascot(): THREE.Group {
  const g = makePerson({ shirt: 0x5c8a3c, pants: 0x5c8a3c });
  // 얼룩무늬
  g.add(box(0.2, 0.18, 0.36, 0x2f5a25, -0.14, 0.92, 0), box(0.22, 0.16, 0.36, 0x3d3a22, 0.12, 0.72, 0));
  g.add(box(0.5, 0.07, 0.36, 0x2b2b2b, 0, 0.56, 0));
  // 뾰족한 머리카락
  for (let i = -2; i <= 2; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 5), mat(0x111111));
    spike.position.set(i * 0.15, 1.98 - Math.abs(i) * 0.04, 0);
    g.add(spike);
  }
  g.add(box(0.78, 0.12, 0.6, 0x111111, 0, 1.84, 0.05));
  // 활짝 웃는 입
  g.add(box(0.46, 0.2, 0.05, 0xb5362e, 0, 1.36, -0.4), box(0.42, 0.07, 0.06, 0xffffff, 0, 1.43, -0.41));
  // 치켜든 엄지
  const { armR } = g.userData.parts;
  armR.rotation.x = 1.5;
  armR.add(box(0.2, 0.2, 0.2, 0xf1c9a5, 0, -0.58, 0), box(0.08, 0.08, 0.2, 0xf1c9a5, 0, -0.58, 0.18));
  g.scale.setScalar(1.45);
  return g;
}

/**
 * 거인의 머리를 만든다. 덥수룩한 검은 머리, 크고 둥근 눈, 찌푸린 눈썹, 꾹 다문 입이 특징이다.
 * @author heojeehaeng(claude)
 * @param {number} skin 피부색
 * @return {THREE.Group} 거인 머리. 얼굴은 +z(플레이어 쪽)를 향하고 원점은 머리 중심이다
 */
export function makeGiantHead(skin: number): THREE.Group {
  const g = new THREE.Group();
  const hair = 0x1c1612;
  g.add(new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 14), mat(skin)));
  // 크고 둥근 눈: 흰자, 회색 눈동자, 검은 동공, 반짝이는 점
  const flat = (r: number, color: number, x: number, y: number, z: number) => {
    const c = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ color }));
    c.position.set(x, y, z);
    return c;
  };
  for (const sx of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 12), mat(0xf4f4f0));
    white.scale.z = 0.4;
    white.position.set(sx * 0.98, 0.3, 2.12);
    g.add(white);
    g.add(flat(0.44, 0x8a8f96, sx * 0.98, 0.3, 2.42), flat(0.2, 0x111111, sx * 0.98, 0.3, 2.44), flat(0.09, 0xffffff, sx * 0.98 + 0.16, 0.48, 2.46));
    // 안쪽 끝이 내려간 굵은 눈썹
    const brow = box(1.25, 0.24, 0.3, hair, sx * 0.98, 1.18, 2.2);
    brow.rotation.z = sx * 0.32;
    g.add(brow);
    // 아래로 처진 입꼬리
    const corner = box(0.45, 0.13, 0.2, 0x5a2f24, sx * 0.82, -1.22, 2.08);
    corner.rotation.z = sx * -0.55;
    g.add(corner);
    // 옆으로 내려온 머리카락
    g.add(box(0.8, 3.4, 2.2, hair, sx * 2.35, -0.3, -0.1));
  }
  g.add(box(0.5, 0.7, 0.45, 0xa9694f, 0, -0.35, 2.45), box(1.35, 0.14, 0.2, 0x5a2f24, 0, -1.1, 2.2));
  // 정수리를 덮는 머리. 뒤로 기울여 이마가 드러나게 한다.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(2.66, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(hair));
  cap.position.y = 0.2;
  cap.rotation.x = -0.5;
  g.add(cap, box(4.2, 3.6, 1.0, hair, 0, -0.6, -2.1));
  // 이마로 삐죽삐죽 내려온 앞머리
  [-1.9, -1.25, -0.6, 0.05, 0.7, 1.35, 1.95].forEach((x, i) => {
    const len = i % 2 ? 1.7 : 1.15;
    const strand = new THREE.Mesh(new THREE.ConeGeometry(0.42, len, 5), mat(hair));
    strand.rotation.x = Math.PI;
    strand.position.set(x, 1.75 - len / 2 + 0.25, Math.sqrt(Math.max(0.5, 6.6 - x * x - 1.6)) + 0.12);
    g.add(strand);
  });
  return g;
}

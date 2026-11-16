import * as THREE from 'three';

const mats = new Map<number, THREE.MeshLambertMaterial>();
const toons = new Map<number, THREE.MeshToonMaterial>();
const flats = new Map<number, THREE.MeshBasicMaterial>();
let ramp: THREE.DataTexture | null = null;

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
 * 만화처럼 명암이 단계로 나뉘는 재질을 색상별로 재사용하여 반환한다. 캐릭터와 동물에 쓴다.
 * @author heojeehaeng(claude)
 * @param {number} color 16진수 색상
 * @return {THREE.MeshToonMaterial} 재질
 */
export function toon(color: number): THREE.MeshToonMaterial {
  let m = toons.get(color);
  if (!m) {
    if (!ramp) {
      // 어두운 면, 중간 면, 밝은 면 세 단계로 나눈다.
      ramp = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
      ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
      ramp.needsUpdate = true;
    }
    m = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
    toons.set(color, m);
  }
  return m;
}

/**
 * 조명의 영향을 받지 않는 재질을 색상별로 재사용하여 반환한다. 눈의 반짝임처럼 항상 또렷해야 하는 곳에 쓴다.
 * @author heojeehaeng(claude)
 * @param {number} color 16진수 색상
 * @return {THREE.MeshBasicMaterial} 재질
 */
function flat(color: number): THREE.MeshBasicMaterial {
  let m = flats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    flats.set(color, m);
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
  for (const map of [mats, toons, flats]) for (const v of map.values()) if (v === material) return true;
  return false;
}

/**
 * 여러 물체가 함께 쓰는 도형으로 표시한다. 표시한 도형은 물체를 지울 때 해제하지 않는다.
 * @author heojeehaeng(claude)
 * @param {THREE.BufferGeometry} geo 도형
 * @return {THREE.BufferGeometry} 표시한 도형
 */
function shared<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.shared = true;
  return geo;
}

/** 캐릭터와 동물이 함께 쓰는 기본 도형 */
const G = {
  ball: shared(new THREE.SphereGeometry(1, 18, 14)),
  ballLow: shared(new THREE.SphereGeometry(1, 10, 8)),
  dome: shared(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
  pill: shared(new THREE.CapsuleGeometry(1, 2, 5, 12)),
  tube: shared(new THREE.CylinderGeometry(1, 1, 1, 14)),
  cone: shared(new THREE.ConeGeometry(1, 1, 6)),
  cube: shared(new THREE.BoxGeometry(1, 1, 1)),
  disc: shared(new THREE.CircleGeometry(1, 18)),
};

const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false });
shadowMat.userData.shared = true;

/**
 * 함께 쓰는 도형으로 만화풍 부품을 만든다.
 * @author heojeehaeng(claude)
 * @param {THREE.BufferGeometry} geo 함께 쓰는 도형
 * @param {number} color 색상
 * @param {number[]} pos 위치 [x, y, z]
 * @param {number[]} scale 크기 [x, y, z]
 * @return {THREE.Mesh} 부품
 */
function part(geo: THREE.BufferGeometry, color: number, pos: number[], scale: number[]): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color));
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  return m;
}

/**
 * 양 끝이 둥근 막대를 만든다. 팔다리와 몸통에 쓴다.
 * @author heojeehaeng(claude)
 * @param {number} color 색상
 * @param {number} r 반지름
 * @param {number} len 전체 길이
 * @param {number[]} pos 중심 위치 [x, y, z]
 * @param {string} axis 막대가 놓이는 방향. 'y'가 세로다
 * @return {THREE.Mesh} 막대
 */
function pill(color: number, r: number, len: number, pos: number[], axis: 'x' | 'y' | 'z' = 'y'): THREE.Mesh {
  // 기본 도형은 반지름 1, 전체 길이 4이므로 반지름과 길이를 따로 맞춘다.
  const m = part(G.pill, color, pos, [r, len / 4, r]);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  else if (axis === 'z') m.rotation.x = Math.PI / 2;
  return m;
}

/**
 * 발밑에 까는 둥근 그림자를 만든다.
 * @author heojeehaeng(claude)
 * @param {number} rx 좌우 반지름
 * @param {number} rz 앞뒤 반지름
 * @return {THREE.Mesh} 그림자
 */
function blob(rx: number, rz: number): THREE.Mesh {
  const m = new THREE.Mesh(G.disc, shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.025;
  m.scale.set(rx, rz, 1);
  return m;
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

const bubbleMats = new Map<string, THREE.MeshBasicMaterial>();

/**
 * 머리 위에 띄우는 말풍선을 만든다. 같은 대사는 재질과 글자 그림을 함께 써서, 적을 다시 배치할 때마다 새로 그리지 않는다.
 * @author heojeehaeng(claude)
 * @param {string} text 말풍선에 넣을 대사
 * @return {THREE.Mesh} 말풍선. 글자는 +z 방향을 향하고, 꼬리 끝이 원점이다
 */
export function makeBubble(text: string): THREE.Mesh {
  const lines = wrapBubble(text);
  const longest = Math.max(...lines.map((l) => l.length));
  // 길을 가리지 않도록 글자 한 자를 0.26m 안팎으로 작게 잡는다.
  const w = 0.26 * longest + 0.5;
  const body = 0.34 * lines.length + 0.2;
  const tail = 0.16;
  const h = body + tail;
  let material = bubbleMats.get(text);
  if (!material) {
    const px = 240;
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * px);
    cv.height = Math.round(h * px);
    const g = cv.getContext('2d')!;
    const pad = 5;
    const bw = cv.width - pad * 2;
    const bh = Math.round(body * px) - pad * 2;
    const r = Math.min(bh / 2, 0.16 * px);
    const cx = cv.width / 2;
    g.beginPath();
    g.moveTo(pad + r, pad);
    g.arcTo(pad + bw, pad, pad + bw, pad + bh, r);
    g.arcTo(pad + bw, pad + bh, pad, pad + bh, r);
    // 아래 가운데에 말하는 사람을 가리키는 꼬리를 낸다.
    g.lineTo(cx + 0.1 * px, pad + bh);
    g.lineTo(cx, cv.height - pad);
    g.lineTo(cx - 0.1 * px, pad + bh);
    g.arcTo(pad, pad + bh, pad, pad, r);
    g.arcTo(pad, pad, pad + bw, pad, r);
    g.closePath();
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = '#b3261e';
    g.stroke();
    const size = Math.floor(Math.min((bh * 0.84) / (lines.length * 1.18), (bw * 0.92) / longest));
    g.fillStyle = '#8f1a14';
    g.font = `bold ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, cx, pad + bh / 2 + (i - (lines.length - 1) / 2) * size * 1.18));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    material.userData.shared = true;
    bubbleMats.set(text, material);
  }
  const geo = new THREE.PlaneGeometry(w, h);
  // 꼬리 끝이 원점에 오도록 올려서, 놓는 위치가 곧 말하는 사람의 머리 위가 되게 한다.
  geo.translate(0, h / 2, 0);
  return new THREE.Mesh(geo, material);
}

/**
 * 말풍선에 넣을 대사를 줄로 나눈다. 긴 대사는 가운데에 가까운 띄어쓰기에서 두 줄로 나눈다.
 * @author heojeehaeng(claude)
 * @param {string} text 대사
 * @return {string[]} 줄 목록
 */
function wrapBubble(text: string): string[] {
  if (text.length <= 9) return [text];
  let cut = -1;
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] === ' ' && (cut < 0 || Math.abs(i - text.length / 2) < Math.abs(cut - text.length / 2))) cut = i;
  }
  return cut < 0 ? [text] : [text.slice(0, cut), text.slice(cut + 1)];
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

export type Face = 'calm' | 'angry' | 'smile' | 'grin' | 'sleepy';

export interface PersonOpts {
  shirt: number;
  pants: number;
  skin?: number;
  hat?: number;
  /** 모자 대신 냄비를 쓴다 */
  pot?: boolean;
  /** 표정. 기본은 차분한 얼굴이다 */
  face?: Face;
  /** 머리카락 색 */
  hair?: number;
  /** 왼팔에 두르는 완장 색 */
  armband?: number;
  /** 모자 앞에 다는 표식 색 */
  badge?: number;
  /** 등에 매는 보따리 */
  pack?: boolean;
  /** 목에 두르는 수건 색 */
  scarf?: number;
  /** true면 얼굴 부품을 만들지 않는다. 뒷모습만 보이는 행진 대열처럼 수가 많을 때 쓴다 */
  back?: boolean;
  /** true면 발밑 그림자를 만들지 않는다. 그림자를 따로 그리는 주인공에 쓴다 */
  noShadow?: boolean;
}

/**
 * 얼굴 부품(눈, 눈썹, 입, 볼)을 표정에 맞춰 붙인다. 얼굴은 -z 방향이다.
 * @author heojeehaeng(claude)
 * @param {THREE.Group} g 사람 모델
 * @param {Face} face 표정
 * @param {number} skin 피부색
 */
function addFace(g: THREE.Group, face: Face, skin: number): void {
  const dark = 0x1d1a18;
  for (const sx of [-1, 1]) {
    const x = sx * 0.155;
    // 졸린 얼굴은 눈을 감은 가는 선으로 그린다.
    const eye = part(G.ballLow, dark, [x, 1.53, -0.385], [0.062, face === 'sleepy' ? 0.014 : 0.078, 0.03]);
    g.add(eye);
    if (face !== 'sleepy') {
      const shine = new THREE.Mesh(G.ballLow, flat(0xffffff));
      shine.position.set(x - 0.022, 1.565, -0.415);
      shine.scale.setScalar(0.02);
      g.add(shine);
    }
    const brow = part(G.cube, dark, [x, 1.665, -0.385], [0.15, 0.034, 0.03]);
    // 안쪽 끝이 내려가면 화난 얼굴, 바깥 끝이 내려가면 순한 얼굴이 된다.
    brow.rotation.z = sx * (face === 'angry' ? 0.42 : face === 'sleepy' ? -0.25 : face === 'calm' ? 0 : -0.12);
    if (face === 'angry') brow.position.y = 1.64;
    g.add(brow);
    if (face !== 'angry') g.add(part(G.ballLow, 0xf2a39c, [sx * 0.27, 1.41, -0.335], [0.06, 0.04, 0.02]));
  }
  g.add(part(G.ballLow, darken(skin), [0, 1.455, -0.425], [0.032, 0.03, 0.03]));
  if (face === 'angry') g.add(part(G.ballLow, 0x7a1f1a, [0, 1.335, -0.385], [0.095, 0.07, 0.03]), part(G.cube, 0xffffff, [0, 1.365, -0.41], [0.12, 0.022, 0.02]));
  else if (face === 'grin') g.add(part(G.ballLow, 0xb5362e, [0, 1.335, -0.385], [0.15, 0.085, 0.03]), part(G.cube, 0xffffff, [0, 1.372, -0.41], [0.2, 0.03, 0.02]));
  else if (face === 'smile') g.add(part(G.ballLow, 0x7a2b22, [0, 1.345, -0.39], [0.075, 0.035, 0.02]));
  else if (face === 'sleepy') g.add(part(G.ballLow, 0x7a2b22, [0, 1.335, -0.395], [0.035, 0.04, 0.02]));
  else g.add(part(G.cube, 0x7a2b22, [0, 1.345, -0.4], [0.1, 0.022, 0.02]));
}

/**
 * 색을 조금 어둡게 만든다. 코나 주름처럼 같은 계열의 그늘진 색이 필요할 때 쓴다.
 * @author heojeehaeng(claude)
 * @param {number} color 원래 색
 * @return {number} 어두워진 색
 */
function darken(color: number): number {
  const r = ((color >> 16) & 255) * 0.82;
  const g = ((color >> 8) & 255) * 0.78;
  const b = (color & 255) * 0.76;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/**
 * 머리가 큰 2.5등신 사람 모델을 만든다. 기본 방향은 -z(달리는 방향)이다.
 * @author heojeehaeng(claude)
 * @param {PersonOpts} o 옷, 모자, 표정, 소품
 * @return {THREE.Group} 사람 모델. userData.parts에 팔다리 관절이 들어 있다
 */
export function makePerson(o: PersonOpts): THREE.Group {
  const g = new THREE.Group();
  const skin = o.skin ?? 0xf3cfae;
  const hair = o.hair ?? 0x1c1612;
  const limb = (x: number, y: number, arm: boolean) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(pill(arm ? o.shirt : o.pants, arm ? 0.078 : 0.1, 0.44, [0, -0.2, 0]));
    // 수가 많은 행진 대열은 손과 신발 같은 작은 부품을 빼서 그리는 양을 줄인다.
    if (!o.back) pivot.add(arm ? part(G.ballLow, skin, [0, -0.47, 0], [0.085, 0.085, 0.085]) : part(G.ball, 0x2a2420, [0, -0.45, -0.045], [0.115, 0.075, 0.17]));
    g.add(pivot);
    return pivot;
  };
  const legL = limb(-0.135, 0.5, false);
  const legR = limb(0.135, 0.5, false);
  // 몸통은 앞뒤로 납작한 둥근 막대, 그 아래에 허리띠를 두른다.
  const torso = pill(o.shirt, 0.29, 0.74, [0, 0.83, 0]);
  torso.scale.z = 0.215;
  g.add(torso);
  if (!o.back) g.add(part(G.tube, darken(o.pants), [0, 0.6, 0], [0.3, 0.07, 0.225]));
  const armL = limb(-0.385, 1.07, true);
  const armR = limb(0.385, 1.07, true);
  const head = part(G.ball, skin, [0, 1.5, 0], [0.42, 0.42, 0.42]);
  g.add(head);
  if (!o.back) {
    g.add(part(G.ballLow, skin, [-0.41, 1.47, 0], [0.07, 0.09, 0.06]), part(G.ballLow, skin, [0.41, 1.47, 0], [0.07, 0.09, 0.06]));
    addFace(g, o.face ?? 'calm', skin);
  }
  // 뒤통수를 덮는 머리카락. 앞쪽을 들어 올려 이마가 드러나게 한다.
  const cap = part(G.dome, hair, [0, 1.52, 0.01], [0.44, 0.44, 0.44]);
  cap.rotation.x = 0.42;
  g.add(cap);
  if (o.pot) {
    g.add(part(G.tube, 0x9aa0a6, [0, 1.93, 0], [0.4, 0.3, 0.4]), part(G.cube, 0x9aa0a6, [0.52, 1.98, 0], [0.3, 0.05, 0.08]));
  } else if (o.hat !== undefined) {
    g.add(part(G.tube, o.hat, [0, 1.9, 0], [0.4, 0.2, 0.4]));
    if (!o.back) g.add(part(G.tube, darken(o.hat), [0, 1.81, 0], [0.43, 0.05, 0.43]), part(G.cube, darken(o.hat), [0, 1.8, -0.46], [0.46, 0.035, 0.22]));
    if (o.badge !== undefined) g.add(part(G.ballLow, o.badge, [0, 1.9, -0.4], [0.07, 0.07, 0.03]));
  }
  if (o.armband !== undefined) armL.add(part(G.tube, o.armband, [0, -0.13, 0], [0.095, 0.1, 0.095]));
  if (o.scarf !== undefined) g.add(part(G.tube, o.scarf, [0, 1.17, 0], [0.26, 0.09, 0.22]), part(G.cube, o.scarf, [0.1, 1.02, 0.2], [0.11, 0.3, 0.04]));
  if (o.pack) {
    g.add(part(G.ball, 0xc9b28a, [0, 0.92, 0.3], [0.27, 0.24, 0.2]), part(G.ballLow, 0xb39a70, [0, 1.17, 0.3], [0.09, 0.07, 0.08]));
    const strap = part(G.cube, 0x6b5a3e, [0, 0.9, -0.01], [0.07, 0.72, 0.5]);
    strap.rotation.z = 0.5;
    g.add(strap);
  }
  if (!o.noShadow && !o.back) g.add(blob(0.42, 0.36));
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
 * 동물의 눈을 한 쌍 붙인다.
 * @author heojeehaeng(claude)
 * @param {THREE.Group} g 동물 모델
 * @param {number[]} at 두 눈 사이 가운데 위치 [x, y, z]
 * @param {string} axis 얼굴이 향하는 방향. 눈은 이 방향의 수직으로 벌어진다
 * @param {number} gap 두 눈 사이 거리의 절반
 * @param {number} r 눈 크기
 */
function addEyes(g: THREE.Group, at: number[], axis: 'x' | 'z', gap: number, r: number): void {
  for (const s of [-1, 1]) {
    const pos = axis === 'x' ? [at[0], at[1], at[2] + s * gap] : [at[0] + s * gap, at[1], at[2]];
    g.add(part(G.ballLow, 0x151515, pos, [r, r * 1.2, r]));
    const shine = new THREE.Mesh(G.ballLow, flat(0xffffff));
    shine.position.set(pos[0] + (axis === 'x' ? r * 0.7 : 0), pos[1] + r * 0.5, pos[2] + (axis === 'z' ? r * 0.7 : 0));
    shine.scale.setScalar(r * 0.32);
    g.add(shine);
  }
}

/**
 * 곰 모델을 만든다. 두 다리를 넓게 벌리고 서서 가랑이 사이가 문처럼 뚫려 있고, 베어허그를 하려고 앞발을 벌린다. 얼굴은 +z 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 곰 모델. userData.arms에 벌린 앞발이, userData.guide에 다리 사이로 이끄는 바닥 화살표가 들어 있다
 */
export function makeBear(): THREE.Group {
  const g = new THREE.Group();
  const fur = 0x7a4a26;
  const pale = 0xd9b38c;
  const dark = darken(fur);
  for (const s of [-1, 1]) {
    // 다리를 바깥으로 벌려 세워서 슬라이드로 지나갈 틈을 만든다.
    const leg = pill(fur, 0.24, 1.3, [s * 0.86, 0.7, 0]);
    leg.rotation.z = s * 0.26;
    g.add(leg, part(G.ball, fur, [s * 0.62, 1.42, 0], [0.38, 0.36, 0.4]));
    g.add(part(G.ball, dark, [s * 1.05, 0.13, 0.14], [0.3, 0.15, 0.42]));
    for (let k = -1; k <= 1; k++) {
      const claw = part(G.cone, 0xf2ead8, [s * 1.05 + k * 0.13, 0.1, 0.56], [0.035, 0.13, 0.035]);
      claw.rotation.x = Math.PI / 2;
      g.add(claw);
    }
  }
  g.add(part(G.ball, fur, [0, 1.98, 0], [0.96, 0.8, 0.62]), part(G.ball, pale, [0, 1.94, 0.36], [0.52, 0.56, 0.32]));
  g.add(part(G.ball, fur, [0, 2.92, 0.12], [0.52, 0.48, 0.48]), part(G.ball, pale, [0, 2.82, 0.52], [0.25, 0.2, 0.2]));
  g.add(part(G.ballLow, 0x151515, [0, 2.89, 0.72], [0.08, 0.06, 0.05]), part(G.ballLow, 0x5a1f1a, [0, 2.72, 0.66], [0.1, 0.07, 0.05]));
  for (const s of [-1, 1]) g.add(part(G.ballLow, fur, [s * 0.4, 3.3, 0.08], [0.17, 0.17, 0.1]), part(G.ballLow, pale, [s * 0.4, 3.29, 0.14], [0.09, 0.09, 0.06]));
  addEyes(g, [0, 3.03, 0.54], 'z', 0.2, 0.06);
  // 건빵 봉지
  g.add(part(G.cube, 0xd8c690, [0.62, 1.9, 0.52], [0.42, 0.5, 0.16]), part(G.cube, 0xb8412e, [0.62, 1.95, 0.61], [0.3, 0.14, 0.02]));
  const arms = new THREE.Group();
  for (const s of [-1, 1]) {
    // 어깨에서 바깥 아래, 앞쪽으로 뻗어 달려오는 사람을 끌어안는 자세를 만든다.
    const arm = new THREE.Group();
    arm.position.set(s * 0.6, 2.32, 0.1);
    arm.rotation.set(0, -s * 0.35, -s * 0.5);
    arm.add(pill(fur, 0.21, 1.5, [s * 0.7, 0, 0], 'x'), part(G.ball, dark, [s * 1.46, 0, 0.06], [0.27, 0.3, 0.3]));
    for (let k = -1; k <= 1; k++) {
      const claw = part(G.cone, 0xf2ead8, [s * 1.56, k * 0.14, 0.34], [0.04, 0.16, 0.04]);
      claw.rotation.x = Math.PI / 2;
      arm.add(claw);
    }
    arms.add(arm);
  }
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.2), bearGuideMat());
  guide.rotation.x = -Math.PI / 2;
  guide.position.set(0, 0.045, 1.7);
  g.add(arms, guide, blob(1.4, 0.8));
  g.userData.arms = arms;
  g.userData.guide = guide;
  return g;
}

let guideMat: THREE.MeshBasicMaterial | null = null;

/**
 * 곰의 다리 사이로 이끄는 바닥 화살표 재질을 반환한다. 모든 곰이 한 장을 함께 쓴다.
 * @author heojeehaeng(claude)
 * @return {THREE.MeshBasicMaterial} 화살표가 반복되는 재질. 질감을 세로로 밀면 화살표가 흐른다
 */
function bearGuideMat(): THREE.MeshBasicMaterial {
  if (guideMat) return guideMat;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const c = cv.getContext('2d')!;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // 캔버스 위쪽이 곰 쪽이므로 위를 가리키는 꺾쇠를 그린다. 밝은 풀밭에서도 보이도록 어두운 테두리를 먼저 깐다.
  for (const [color, width] of [['#3a2a00', 34], ['#ffe14d', 20]] as const) {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(26, 98);
    c.lineTo(64, 44);
    c.lineTo(102, 98);
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  guideMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  guideMat.userData.shared = true;
  return guideMat;
}

/**
 * 민화풍 호랑이 모델을 만든다. 까치 한 마리가 위에서 따라다닌다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 호랑이 모델. 머리는 +x 방향이다
 */
export function makeTiger(): THREE.Group {
  const g = new THREE.Group();
  const fur = 0xee9a2e;
  g.add(pill(fur, 0.36, 1.9, [0, 0.78, 0], 'x'), part(G.ball, 0xfff3d6, [0.1, 0.62, 0], [0.7, 0.24, 0.3]));
  for (const sx of [-0.55, -0.15, 0.25]) {
    const stripe = part(G.tube, 0x1e1a16, [sx, 0.82, 0], [0.365, 0.1, 0.365]);
    stripe.rotation.z = Math.PI / 2;
    stripe.scale.set(0.37, 0.09, 0.37);
    g.add(stripe);
  }
  g.add(part(G.ball, fur, [1.12, 1.02, 0], [0.42, 0.4, 0.42]), part(G.ball, 0xfff3d6, [1.42, 0.92, 0], [0.2, 0.17, 0.26]));
  g.add(part(G.ballLow, 0x151515, [1.6, 0.98, 0], [0.05, 0.05, 0.08]));
  for (const s of [-1, 1]) {
    g.add(part(G.ballLow, fur, [1.05, 1.4, s * 0.26], [0.12, 0.14, 0.1]), part(G.cube, 0x1e1a16, [1.2, 1.3, s * 0.12], [0.03, 0.14, 0.05]));
    for (const lx of [-0.62, 0.62]) g.add(pill(fur, 0.11, 0.56, [lx, 0.28, s * 0.22]));
  }
  addEyes(g, [1.46, 1.12, 0], 'x', 0.17, 0.055);
  const tail = pill(fur, 0.07, 0.9, [-1.25, 1.1, 0]);
  tail.rotation.z = 0.7;
  g.add(tail, part(G.ballLow, 0x1e1a16, [-1.56, 1.42, 0], [0.09, 0.09, 0.09]));
  const magpie = new THREE.Group();
  magpie.add(part(G.ballLow, 0x151515, [0, 0, 0], [0.2, 0.13, 0.13]), part(G.ballLow, 0xffffff, [0.02, -0.05, 0], [0.13, 0.08, 0.1]));
  magpie.add(part(G.cone, 0xe0a030, [0.24, 0.02, 0], [0.03, 0.1, 0.03]), part(G.cube, 0x151515, [-0.26, 0.04, 0], [0.22, 0.03, 0.08]));
  magpie.children[2].rotation.z = -Math.PI / 2;
  magpie.position.set(0.4, 2.1, 0);
  g.add(magpie, blob(1.3, 0.5));
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
  const col = 0xecc04a;
  const spot = 0xa8701f;
  for (const lx of [-0.36, 0.36]) for (const lz of [-0.6, 0.6]) g.add(pill(col, 0.11, 1.3, [lx, 0.62, lz]), part(G.ballLow, 0x4a3520, [lx, 0.06, lz], [0.13, 0.08, 0.14]));
  g.add(pill(col, 0.5, 2.1, [0, 1.6, 0], 'z'));
  for (const [sx, sy, sz] of [[0.42, 1.75, 0.4], [-0.44, 1.6, -0.2], [0.4, 1.5, -0.55], [-0.38, 1.82, 0.55], [0, 2.08, 0.1]]) g.add(part(G.ballLow, spot, [sx, sy, sz], [0.16, 0.16, 0.16]));
  const tail = pill(col, 0.04, 0.7, [0, 1.3, -1.15]);
  tail.rotation.x = -0.4;
  g.add(tail);
  const neck = new THREE.Group();
  neck.position.set(0, 1.6, 0);
  neck.add(pill(col, 0.19, neckLen + 0.3, [neckLen / 2, 0, 0], 'x'));
  for (let i = 1; i < neckLen; i += 1.1) neck.add(part(G.ballLow, spot, [i, 0.13 * (i % 2 ? 1 : -1), 0.1 * (i % 3 ? 1 : -1)], [0.16, 0.12, 0.12]));
  neck.add(part(G.ball, col, [neckLen + 0.35, 0, 0], [0.5, 0.26, 0.27]), part(G.ball, 0xf6e2b0, [neckLen + 0.72, -0.03, 0], [0.2, 0.17, 0.2]));
  for (const s of [-1, 1]) {
    neck.add(pill(spot, 0.04, 0.34, [neckLen + 0.2, 0.36, s * 0.12]), part(G.ballLow, spot, [neckLen + 0.2, 0.55, s * 0.12], [0.07, 0.07, 0.07]));
    neck.add(part(G.ballLow, col, [neckLen + 0.05, 0.18, s * 0.3], [0.08, 0.06, 0.14]));
  }
  addEyes(neck, [neckLen + 0.52, 0.1, 0], 'x', 0.22, 0.05);
  // 탈북 보따리
  neck.add(part(G.ball, 0xc0392b, [neckLen * 0.45, -0.48, 0], [0.36, 0.32, 0.32]), part(G.ballLow, 0xa52f23, [neckLen * 0.45, -0.14, 0], [0.1, 0.1, 0.1]));
  g.add(neck, blob(0.8, 1.2));
  g.userData.neck = neck;
  return g;
}

/**
 * 고양이 모델을 만든다. 머리는 +x 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 고양이 모델
 */
export function makeCat(): THREE.Group {
  const g = new THREE.Group();
  const fur = 0x9aa0a8;
  g.add(pill(fur, 0.17, 0.85, [0, 0.38, 0], 'x'), part(G.ball, fur, [0.48, 0.55, 0], [0.2, 0.19, 0.2]));
  g.add(part(G.ballLow, 0xffffff, [0.62, 0.5, 0], [0.09, 0.07, 0.11]), part(G.ballLow, 0xe58a9a, [0.7, 0.53, 0], [0.025, 0.02, 0.03]));
  for (const s of [-1, 1]) {
    g.add(part(G.cone, fur, [0.44, 0.78, s * 0.11], [0.07, 0.15, 0.07]));
    for (const lx of [-0.28, 0.28]) g.add(pill(fur, 0.05, 0.26, [lx, 0.13, s * 0.1]));
  }
  addEyes(g, [0.63, 0.6, 0], 'x', 0.09, 0.035);
  const tail = pill(fur, 0.04, 0.55, [-0.48, 0.66, 0]);
  tail.rotation.z = 0.5;
  g.add(tail, blob(0.6, 0.28));
  return g;
}

/**
 * 고라니 모델을 만든다. 머리는 +z(달려오는 플레이어 쪽) 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 고라니 모델. userData.legs에 다리가 들어 있다
 */
export function makeDeer(): THREE.Group {
  const g = new THREE.Group();
  const col = 0xb08a58;
  g.add(pill(col, 0.27, 1.25, [0, 0.88, 0], 'z'), part(G.ball, 0xf0dfc0, [0, 0.76, 0], [0.2, 0.14, 0.5]));
  const neck = pill(col, 0.12, 0.6, [0, 1.15, 0.52]);
  neck.rotation.x = 0.5;
  g.add(neck, part(G.ball, col, [0, 1.38, 0.72], [0.19, 0.19, 0.26]), part(G.ballLow, 0x2a2018, [0, 1.33, 0.97], [0.05, 0.04, 0.04]));
  for (const s of [-1, 1]) {
    g.add(part(G.ballLow, col, [s * 0.17, 1.6, 0.62], [0.06, 0.14, 0.04]));
    // 고라니는 뿔 대신 송곳니가 있다.
    g.add(part(G.cone, 0xffffff, [s * 0.07, 1.2, 0.9], [0.02, 0.12, 0.02]));
  }
  g.children.filter((c) => (c as THREE.Mesh).geometry === G.cone).forEach((c) => (c.rotation.x = Math.PI));
  addEyes(g, [0, 1.43, 0.9], 'z', 0.13, 0.04);
  const legs: THREE.Mesh[] = [];
  for (const lx of [-0.15, 0.15]) {
    for (const lz of [-0.42, 0.42]) {
      const leg = pill(col, 0.055, 0.66, [lx, 0.33, lz]);
      legs.push(leg);
      g.add(leg);
    }
  }
  g.add(part(G.ballLow, 0xffffff, [0, 0.98, -0.66], [0.08, 0.08, 0.06]), blob(0.4, 0.8));
  g.userData.legs = legs;
  return g;
}

/**
 * 멧돼지 모델을 만든다. 머리는 +z(달려오는 플레이어 쪽) 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 멧돼지 모델. userData.legs에 다리가 들어 있다
 */
export function makeBoar(): THREE.Group {
  const g = new THREE.Group();
  const col = 0x54402f;
  g.add(pill(col, 0.5, 1.75, [0, 0.82, 0], 'z'), part(G.ball, col, [0, 0.8, 0.95], [0.4, 0.38, 0.42]));
  const snout = part(G.tube, 0x8a6a5a, [0, 0.68, 1.36], [0.17, 0.2, 0.15]);
  snout.rotation.x = Math.PI / 2;
  g.add(snout, part(G.ballLow, 0x2a1c14, [-0.06, 0.68, 1.47], [0.03, 0.04, 0.02]), part(G.ballLow, 0x2a1c14, [0.06, 0.68, 1.47], [0.03, 0.04, 0.02]));
  // 등줄기를 따라 선 갈기
  for (let z = -0.7; z <= 0.7; z += 0.28) g.add(part(G.cone, 0x2a2018, [0, 1.42, z], [0.09, 0.3, 0.09]));
  for (const s of [-1, 1]) {
    const tusk = part(G.cone, 0xfff3d6, [s * 0.24, 0.72, 1.3], [0.04, 0.24, 0.04]);
    tusk.rotation.z = s * -0.35;
    g.add(tusk, part(G.ballLow, col, [s * 0.3, 1.15, 0.8], [0.1, 0.14, 0.06]));
  }
  addEyes(g, [0, 0.95, 1.3], 'z', 0.2, 0.045);
  const legs: THREE.Mesh[] = [];
  for (const lx of [-0.3, 0.3]) {
    for (const lz of [-0.55, 0.55]) {
      const leg = pill(col, 0.09, 0.5, [lx, 0.25, lz]);
      legs.push(leg);
      g.add(leg);
    }
  }
  g.add(blob(0.75, 1.15));
  g.userData.legs = legs;
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
  g.add(box(3.46, 0.08, 9.56, 0xb9b9b9, 0, 0.45, 0));
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });
  for (const sx of [-1.35, 1.35]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.08), lamp);
    light.position.set(sx, 0.85, 4.78);
    g.add(light);
    // 앞 범퍼 양쪽의 장군 깃발
    g.add(box(0.05, 0.9, 0.05, 0xcfcfcf, sx, 1.65, 4.5), box(0.5, 0.32, 0.03, 0xc00000, sx + 0.27, 1.92, 4.5));
    for (const wz of [-3.4, 0, 3.4]) {
      const wheel = part(G.tube, 0x1a1a1a, [sx * 1.25, 0.42, wz], [0.42, 0.3, 0.42]);
      wheel.rotation.z = Math.PI / 2;
      g.add(wheel);
    }
  }
  const plate = makeSign('★★★★', 1.5, 0.42, '#c00000', '#ffd700', 0);
  plate.position.set(0, 0.12, 4.82);
  g.add(plate, blob(2.0, 5.0));
  return g;
}

/**
 * 엄지를 치켜든 육군 마스코트 '굳건이' 모델을 만든다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 마스코트 모델. 기본 방향은 -z이다
 */
export function makeMascot(): THREE.Group {
  const g = makePerson({ shirt: 0x5c8a3c, pants: 0x5c8a3c, face: 'grin', hair: 0x111111 });
  // 얼룩무늬
  for (const [x, y, c] of [[-0.14, 0.95, 0x2f5a25], [0.12, 0.75, 0x3d3a22], [0.02, 1.08, 0x3d3a22], [-0.1, 0.68, 0x2f5a25]]) {
    g.add(part(G.ballLow, c, [x, y, -0.21], [0.11, 0.08, 0.04]));
  }
  // 뾰족한 머리카락
  for (let i = -2; i <= 2; i++) g.add(part(G.cone, 0x111111, [i * 0.15, 1.99 - Math.abs(i) * 0.04, -0.02], [0.1, 0.3, 0.1]));
  // 치켜든 엄지
  const { armR } = g.userData.parts;
  armR.rotation.x = 1.5;
  armR.add(part(G.ballLow, 0xf3cfae, [0, -0.5, 0.12], [0.045, 0.045, 0.1]));
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
  g.add(part(G.ball, skin, [0, 0, 0], [2.5, 2.5, 2.5]));
  // 크고 둥근 눈: 흰자, 회색 눈동자, 검은 동공, 반짝이는 점
  const dot = (r: number, color: number, x: number, y: number, z: number) => {
    const c = new THREE.Mesh(G.disc, flat(color));
    c.position.set(x, y, z);
    c.scale.setScalar(r);
    return c;
  };
  for (const sx of [-1, 1]) {
    g.add(part(G.ball, 0xf4f4f0, [sx * 0.98, 0.3, 2.12], [0.72, 0.72, 0.29]));
    g.add(dot(0.44, 0x8a8f96, sx * 0.98, 0.3, 2.42), dot(0.2, 0x111111, sx * 0.98, 0.3, 2.44), dot(0.09, 0xffffff, sx * 0.98 + 0.16, 0.48, 2.46));
    // 안쪽 끝이 내려간 굵은 눈썹
    const brow = part(G.cube, hair, [sx * 0.98, 1.18, 2.2], [1.25, 0.24, 0.3]);
    brow.rotation.z = sx * 0.32;
    g.add(brow);
    // 아래로 처진 입꼬리
    const corner = part(G.cube, 0x5a2f24, [sx * 0.82, -1.22, 2.08], [0.45, 0.13, 0.2]);
    corner.rotation.z = sx * -0.55;
    g.add(corner);
    // 옆으로 내려온 머리카락
    g.add(part(G.cube, hair, [sx * 2.35, -0.3, -0.1], [0.8, 3.4, 2.2]));
  }
  g.add(part(G.cube, darken(skin), [0, -0.35, 2.45], [0.5, 0.7, 0.45]), part(G.cube, 0x5a2f24, [0, -1.1, 2.2], [1.35, 0.14, 0.2]));
  // 정수리를 덮는 머리. 뒤로 기울여 이마가 드러나게 한다.
  const cap = part(G.dome, hair, [0, 0.2, 0], [2.66, 2.66, 2.66]);
  cap.rotation.x = -0.5;
  g.add(cap, part(G.cube, hair, [0, -0.6, -2.1], [4.2, 3.6, 1.0]));
  // 이마로 삐죽삐죽 내려온 앞머리
  [-1.9, -1.25, -0.6, 0.05, 0.7, 1.35, 1.95].forEach((x, i) => {
    const len = i % 2 ? 1.7 : 1.15;
    const strand = part(G.cone, hair, [x, 1.75 - len / 2 + 0.25, Math.sqrt(Math.max(0.5, 6.6 - x * x - 1.6)) + 0.12], [0.42, len, 0.42]);
    strand.rotation.x = Math.PI;
    g.add(strand);
  });
  return g;
}

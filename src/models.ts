import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FONT, FONT_DISPLAY } from './config';

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

/**
 * 둥근 막대 도형의 무늬 좌표를 길이에 비례하게 고친다.
 * 기본 좌표는 양 끝의 둥근 부분에 대부분을 쓰고 가운데 곧은 부분에는 조금만 써서, 무늬를 입히면 가운데가 세로로 길게 늘어난다.
 * @author heojeehaeng(claude)
 * @param {THREE.CapsuleGeometry} geo 반지름 1, 곧은 부분 길이 2인 둥근 막대
 * @return {THREE.CapsuleGeometry} 좌표를 고친 도형
 */
function evenPill(geo: THREE.CapsuleGeometry): THREE.CapsuleGeometry {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const total = Math.PI + 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // 아래 둥근 끝, 곧은 부분, 위 둥근 끝의 순서로 겉면을 따라 잰 거리를 구한다.
    let along = Math.PI / 2 + (y + 1);
    if (y < -1) along = Math.PI / 2 + Math.asin(Math.max(-1, y + 1));
    else if (y > 1) along = Math.PI / 2 + 2 + Math.asin(Math.min(1, y - 1));
    uv.setY(i, along / total);
  }
  uv.needsUpdate = true;
  return geo;
}

/** 캐릭터와 동물이 함께 쓰는 기본 도형 */
const G = {
  ball: shared(new THREE.SphereGeometry(1, 18, 14)),
  ballLow: shared(new THREE.SphereGeometry(1, 10, 8)),
  dome: shared(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
  pill: shared(evenPill(new THREE.CapsuleGeometry(1, 2, 5, 12))),
  tube: shared(new THREE.CylinderGeometry(1, 1, 1, 14)),
  cone: shared(new THREE.ConeGeometry(1, 1, 6)),
  cube: shared(new THREE.BoxGeometry(1, 1, 1)),
  disc: shared(new THREE.CircleGeometry(1, 18)),
  /** 위가 넓고 아래가 좁은 원기둥. 윗면이 넓은 군모에 쓴다 */
  flare: shared(new THREE.CylinderGeometry(1, 0.7, 1, 16)),
  /** 위쪽 절반만 있는 원기둥. 등을 덮는 줄무늬에 쓴다 */
  half: shared(new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, -Math.PI / 2, Math.PI)),
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
  const font = `${size}px ${FONT_DISPLAY}`;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  paintText(t, font, text, () => {
    // 배경을 다시 칠하지 않는 투명한 판은 앞서 그린 글자를 지우고 그린다.
    g.clearRect(wpx * 0.03, hpx * 0.03, wpx * 0.94, hpx * 0.94);
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(wpx * 0.03, hpx * 0.03, wpx * 0.94, hpx * 0.94);
    }
    g.fillStyle = fg;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, wpx / 2, hpx / 2 + (i - (lines.length - 1) / 2) * size * 1.3));
  });
  return t;
}

/**
 * 캔버스에 글자를 그리고, 웹 글꼴이 아직 오지 않았으면 도착한 뒤에 한 번 더 그린다.
 * 글꼴을 쓰이는 글자 조각만큼만 받아 오므로, 처음 그릴 때는 기기의 기본 글꼴로 그려질 수 있다.
 * @author heojeehaeng(claude)
 * @param {THREE.CanvasTexture} tex 다시 그린 뒤 갱신할 텍스처
 * @param {string} font 캔버스 글꼴 지정
 * @param {string} text 그릴 글
 * @param {Function} paint 글자가 들어가는 부분을 지우고 다시 그리는 함수
 */
function paintText(tex: THREE.CanvasTexture, font: string, text: string, paint: () => void): void {
  paint();
  if (document.fonts.check(font, text)) return;
  document.fonts
    .load(font, text)
    .then(() => {
      paint();
      tex.needsUpdate = true;
    })
    .catch(() => undefined);
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
    const size = Math.floor(Math.min((bh * 0.84) / (lines.length * 1.18), (bw * 0.92) / longest));
    const font = `800 ${size}px ${FONT}`;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    paintText(tex, font, text, () => {
      g.clearRect(0, 0, cv.width, cv.height);
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
      g.lineWidth = 8;
      // 화면의 다른 말풍선과 같은 먹선 테두리를 쓴다.
      g.strokeStyle = '#171922';
      g.stroke();
      g.fillStyle = '#c0281f';
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      lines.forEach((l, i) => g.fillText(l, cx, pad + bh / 2 + (i - (lines.length - 1) / 2) * size * 1.18));
    });
    // 외곽선은 깊이 그림을 보고 그리므로, 말풍선이 깊이를 남기지 않으면 뒤에 있는 물체의 외곽선이 말풍선 위로 비친다.
    // 말풍선 모양 안쪽만 깊이를 남기도록 투명한 바깥쪽은 잘라 낸다.
    material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
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
 * @param {string} text 그림 안에 쓰는 글. 글이 있으면 웹 글꼴이 도착한 뒤에 한 번 더 그린다
 * @return {THREE.Group} 입간판
 */
export function makeCutout(
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, text = '',
): THREE.Group {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = Math.round((256 * h) / w);
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  paintText(tex, `20px ${FONT_DISPLAY}`, text, () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    draw(ctx, cv.width, cv.height);
  });
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
  /** true면 윗옷, 바지, 모자를 한국군 위장 무늬로 입힌다 */
  camo?: boolean;
  /** 모자 모양. cap은 챙 달린 작업모(기본), officer는 윗면이 넓은 군모, helmet은 등불 달린 안전모다 */
  hatKind?: 'cap' | 'officer' | 'helmet';
  /** true면 종아리까지 올라오는 군화를 신긴다 */
  boots?: boolean;
  /** true면 옷 부품을 하나로 합치지 않고 따로 둔다. 옷이 찢어지는 리용길에 쓴다 */
  wear?: boolean;
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

const fused = new Map<string, THREE.BufferGeometry>();
let fusedMat: THREE.MeshToonMaterial | null = null;

/**
 * 한 관절에 붙은 단색 부품들을 꼭짓점 색을 가진 도형 하나로 합친다. 부품 수가 늘어도 그리는 횟수는 관절당 한 번으로 유지된다.
 * 합친 도형은 옷차림과 관절 이름으로 기억해 두고 같은 옷차림의 사람끼리 함께 쓴다.
 * @author heojeehaeng(claude)
 * @param {THREE.Object3D} parent 부품이 붙어 있는 관절
 * @param {string} key 옷차림과 관절을 구분하는 이름
 */
function fuse(parent: THREE.Object3D, key: string): void {
  // 무늬가 있는 재질(위장 무늬)과 반투명한 재질(발밑 그림자)은 색 하나로 바꿀 수 없으므로 합치지 않는다.
  const solid = parent.children.filter((c) => {
    const mt = (c as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
    return (c as THREE.Mesh).isMesh && mt && !Array.isArray(mt) && !mt.map && !mt.transparent;
  }) as THREE.Mesh[];
  if (solid.length < 2) return;
  let geo = fused.get(key);
  if (!geo) {
    const list = solid.map((mesh) => {
      mesh.updateMatrix();
      const one = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      one.deleteAttribute('uv');
      const n = one.attributes.position.count;
      const col = new Float32Array(n * 3);
      const c = (mesh.material as THREE.MeshToonMaterial).color;
      for (let k = 0; k < n; k++) col.set([c.r, c.g, c.b], k * 3);
      one.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return one;
    });
    geo = mergeGeometries(list);
    // 복사본은 원래 도형의 표시까지 물려받으므로 합친 도형에는 표시를 새로 단다.
    geo.userData = { shared: true };
    for (const one of list) one.dispose();
    fused.set(key, geo);
  }
  if (!fusedMat) {
    fusedMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(0xffffff).gradientMap });
    fusedMat.userData.shared = true;
  }
  parent.remove(...solid);
  parent.add(new THREE.Mesh(geo, fusedMat));
}

const SHOE = 0x2a2420;

/**
 * 머리가 큰 2.5등신 사람 모델을 만든다. 기본 방향은 -z(달리는 방향)이다.
 * 팔다리는 어깨와 엉덩이, 팔꿈치와 무릎에서 꺾인다.
 * @author heojeehaeng(claude)
 * @param {PersonOpts} o 옷, 모자, 표정, 소품
 * @return {THREE.Group} 사람 모델. userData.parts에 팔다리 관절이 들어 있다
 */
export function makePerson(o: PersonOpts): THREE.Group {
  const g = new THREE.Group();
  const skin = o.skin ?? 0xf3cfae;
  const hair = o.hair ?? 0x1c1612;
  const key = JSON.stringify(o);
  const limb = (name: string, x: number, y: number, arm: boolean) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const color = arm ? o.shirt : o.pants;
    const camo = o.camo ? (arm ? camoMat(0.42, 0.3) : camoMat(0.52, 0.32)) : null;
    g.add(pivot);
    // 수가 많은 행진 대열은 관절과 손발을 빼고 막대 하나로 그려 그리는 양을 줄인다.
    if (o.back) {
      const whole = pill(color, arm ? 0.078 : 0.1, 0.44, [0, -0.2, 0]);
      pivot.add(whole);
      pivot.userData.cloth = [whole];
      return { pivot, lower: null };
    }
    // 위아래 막대의 둥근 끝이 관절 자리에서 겹쳐서, 꺾여도 틈이 보이지 않는다.
    const jy = arm ? -0.2 : -0.22;
    const upper = arm ? pill(color, 0.08, 0.35, [0, -0.105, 0]) : pill(color, 0.104, 0.384, [0, -0.132, 0]);
    const lower = new THREE.Group();
    lower.position.y = jy;
    const under = arm ? pill(color, 0.07, 0.32, [0, -0.09, 0]) : pill(color, 0.092, 0.332, [0, -0.074, 0]);
    if (camo) upper.material = under.material = camo;
    pivot.add(upper, lower);
    lower.add(under);
    if (arm) {
      // 손과 엄지
      lower.add(part(G.ballLow, skin, [0, -0.27, 0], [0.085, 0.085, 0.085]), part(G.ballLow, skin, [x < 0 ? 0.05 : -0.05, -0.25, -0.06], [0.035, 0.045, 0.035]));
    } else {
      // 신발과 밝은 밑창. 뒤로 찬 발바닥이 카메라에 보인다.
      lower.add(part(G.ball, SHOE, [0, -0.225, -0.045], [0.115, 0.075, 0.17]), part(G.ballLow, 0x9a8a72, [0, -0.278, -0.045], [0.12, 0.03, 0.178]));
      if (o.boots) lower.add(part(G.tube, SHOE, [0, -0.13, 0], [0.099, 0.17, 0.099]));
    }
    pivot.userData.cloth = [upper, under];
    pivot.userData.lower = lower;
    pivot.userData.jointY = jy;
    if (!o.wear) fuse(lower, `${key}:${name}`);
    return { pivot, lower };
  };
  const { pivot: legL, lower: kneeL } = limb('legL', -0.135, 0.5, false);
  const { pivot: legR, lower: kneeR } = limb('legR', 0.135, 0.5, false);
  // 몸통은 앞뒤로 납작한 둥근 막대다. 위에는 어깨, 아래에는 골반을 붙여 팔다리가 몸에서 뻗어 나오게 한다.
  const torso = pill(o.shirt, 0.29, 0.74, [0, 0.83, 0]);
  torso.scale.z = 0.215;
  let shoulders = pill(o.shirt, 0.105, 0.94, [0, 1.07, 0], 'x');
  if (o.camo) {
    torso.material = camoMat(1.33, 0.62);
    // 둥근 막대는 뾰족한 양 끝으로 무늬가 모여 줄무늬처럼 보이므로, 위장 무늬 어깨는 끝이 평평한 원기둥으로 만든다.
    shoulders = part(G.tube, o.shirt, [0, 1.07, 0], [0.092, 0.78, 0.092]);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.material = camoMat(0.48, 0.65);
  }
  const hips = part(G.ball, o.pants, [0, 0.5, 0], [0.275, 0.15, 0.2]);
  g.add(torso, shoulders, hips);
  const belt = part(G.tube, darken(o.pants), [0, 0.6, 0], [0.3, 0.07, 0.225]);
  // 앞섶, 가슴 주머니, 허리띠 쇠
  const trim: THREE.Mesh[] = [];
  if (!o.back) {
    g.add(belt);
    const dark = darken(o.shirt);
    trim.push(part(G.cube, 0xd9c36a, [0, 0.6, -0.225], [0.1, 0.075, 0.03]));
    trim.push(part(G.cube, dark, [0, 0.88, -0.212], [0.035, 0.44, 0.02]));
    trim.push(part(G.cube, dark, [-0.15, 0.98, -0.185], [0.11, 0.085, 0.03]), part(G.cube, dark, [0.15, 0.98, -0.185], [0.11, 0.085, 0.03]));
    g.add(...trim);
  }
  const { pivot: armL, lower: elbowL } = limb('armL', -0.385, 1.07, true);
  const { pivot: armR, lower: elbowR } = limb('armR', 0.385, 1.07, true);
  const head = part(G.ball, skin, [0, 1.5, 0], [0.42, 0.42, 0.42]);
  g.add(head);
  if (!o.back) {
    g.add(part(G.ballLow, skin, [-0.41, 1.47, 0], [0.07, 0.09, 0.06]), part(G.ballLow, skin, [0.41, 1.47, 0], [0.07, 0.09, 0.06]));
    addFace(g, o.face ?? 'calm', skin);
    // 이마로 내려온 앞머리와 구레나룻
    g.add(part(G.ballLow, hair, [-0.17, 1.775, -0.27], [0.15, 0.07, 0.1]), part(G.ballLow, hair, [0.13, 1.79, -0.28], [0.17, 0.065, 0.1]));
    g.add(part(G.ballLow, hair, [-0.385, 1.6, -0.03], [0.06, 0.14, 0.13]), part(G.ballLow, hair, [0.385, 1.6, -0.03], [0.06, 0.14, 0.13]));
  }
  // 뒤통수를 덮는 머리카락. 앞쪽을 들어 올려 이마가 드러나게 한다.
  const cap = part(G.dome, hair, [0, 1.52, 0.01], [0.44, 0.44, 0.44]);
  cap.rotation.x = 0.42;
  g.add(cap);
  const hat: THREE.Mesh[] = [];
  const scarf: THREE.Mesh[] = [];
  if (o.pot) {
    g.add(part(G.tube, 0x9aa0a6, [0, 1.93, 0], [0.4, 0.3, 0.4]), part(G.tube, 0x7d8389, [0, 1.79, 0], [0.425, 0.035, 0.425]), part(G.cube, 0x9aa0a6, [0.52, 1.98, 0], [0.3, 0.05, 0.08]));
  } else if (o.hat !== undefined) {
    hat.push(...makeHat(o));
    g.add(...hat);
  }
  if (o.armband !== undefined) armL.add(part(G.tube, o.armband, [0, -0.11, 0], [0.097, 0.1, 0.097]));
  if (o.scarf !== undefined) {
    scarf.push(part(G.tube, o.scarf, [0, 1.17, 0], [0.26, 0.09, 0.22]), part(G.cube, o.scarf, [0.1, 1.02, 0.2], [0.11, 0.3, 0.04]));
    g.add(...scarf);
  }
  if (o.pack) {
    // 등에 멘 보따리와 그 위에 얹은 둘둘 만 담요
    g.add(part(G.ball, 0xc9b28a, [0, 0.9, 0.3], [0.27, 0.24, 0.2]), pill(0x8c7a5a, 0.075, 0.56, [0, 1.15, 0.3], 'x'));
    g.add(part(G.cube, 0x6b5a3e, [-0.19, 1.15, 0.3], [0.03, 0.16, 0.16]), part(G.cube, 0x6b5a3e, [0.19, 1.15, 0.3], [0.03, 0.16, 0.16]));
    const strap = part(G.cube, 0x6b5a3e, [0, 0.9, -0.01], [0.07, 0.72, 0.5]);
    strap.rotation.z = 0.5;
    g.add(strap);
  }
  // 옷이 찢어지는 리용길만 부품을 따로 두고, 나머지는 몸에 붙은 부품을 하나로 합친다.
  if (!o.wear) fuse(g, `${key}:body`);
  if (!o.noShadow && !o.back) g.add(blob(0.42, 0.36));
  g.userData.parts = { legL, legR, armL, armR, head, kneeL, kneeR, elbowL, elbowR };
  g.userData.look = { shirt: o.shirt, pants: o.pants, skin, hair, torso, shoulders, hips, trim, belt, hat, scarf };
  return g;
}

/**
 * 모자 부품을 모양에 맞춰 만든다. 얼굴이 -z를 보므로 챙은 -z 쪽에 단다.
 * @author heojeehaeng(claude)
 * @param {PersonOpts} o 모자 색, 모양, 표식이 든 옷차림
 * @return {THREE.Mesh[]} 모자 부품
 */
function makeHat(o: PersonOpts): THREE.Mesh[] {
  const color = o.hat!;
  const dark = darken(color);
  const out: THREE.Mesh[] = [];
  const brim = (c: number, y: number, w: number) => {
    const b = part(G.ballLow, c, [0, y, -0.42], [w, 0.03, 0.21]);
    b.rotation.x = -0.16;
    return b;
  };
  if (o.hatKind === 'helmet') {
    // 안전모: 둥근 통, 빙 두른 챙, 정수리의 보강대, 이마의 등불
    out.push(part(G.dome, color, [0, 1.7, 0], [0.465, 0.37, 0.465]), part(G.tube, dark, [0, 1.71, 0], [0.52, 0.035, 0.52]));
    if (!o.back) out.push(pill(dark, 0.05, 0.86, [0, 1.995, 0], 'z'), part(G.tube, 0x3a3a3a, [0, 1.86, -0.44], [0.09, 0.07, 0.09]), part(G.ballLow, 0xfff1a8, [0, 1.86, -0.49], [0.07, 0.07, 0.03]));
    return out;
  }
  if (o.hatKind === 'officer') {
    // 군모: 머리띠 위로 윗면이 넓게 퍼지고 앞이 들린다.
    out.push(part(G.tube, o.badge !== undefined ? 0xb3261c : dark, [0, 1.84, 0], [0.412, 0.12, 0.412]));
    const top = part(G.flare, color, [0, 1.98, 0.02], [0.58, 0.17, 0.58]);
    top.rotation.x = 0.2;
    out.push(top);
    if (!o.back) out.push(brim(0x17140f, 1.79, 0.3));
    if (o.badge !== undefined) out.push(part(G.ballLow, 0xf0c020, [0, 1.95, -0.5], [0.075, 0.075, 0.035]));
    return out;
  }
  if (o.camo) {
    // 전투모: 윗면이 평평한 통 모양이다.
    const crown = part(G.tube, color, [0, 1.9, 0], [0.4, 0.2, 0.4]);
    crown.material = camoMat(2.1, 0.17);
    out.push(crown);
  } else {
    // 작업모: 머리를 둥글게 덮는다.
    out.push(part(G.dome, color, [0, 1.74, 0], [0.447, 0.31, 0.447]));
  }
  if (!o.back) out.push(part(G.tube, dark, [0, 1.79, 0], [o.camo ? 0.415 : 0.462, 0.055, o.camo ? 0.415 : 0.462]), brim(dark, 1.78, 0.31));
  if (o.badge !== undefined) out.push(part(G.ballLow, o.badge, [0, 1.9, -0.4], [0.07, 0.07, 0.03]));
  return out;
}

/** 리용길의 피부색. 때가 탈수록 이 재질의 색만 바꾸므로 다른 사람과 겹치지 않는 값을 쓴다 */
export const HERO_SKIN = 0xf2cdab;
/** 옷이 다 벗겨져 팬티만 남는 피해 횟수 */
const WEAR_MAX = 8;

interface WearPiece {
  obj: THREE.Object3D;
  from: number;
  to: number;
}

/**
 * 리용길이 장애물에 당한 횟수만큼 옷을 찢고, 머리를 헝클고, 피부에 때와 생채기를 낸다.
 * 1회 모자, 2~3회 소매, 4~5회 바짓단, 6회 민소매, 7회 윗옷 없음, 8회부터 팬티만 남는다.
 * @author heojeehaeng(claude)
 * @param {THREE.Group} g makePerson으로 만든 리용길 모델. 피부색은 HERO_SKIN이어야 한다
 * @param {number} hits 장애물에 당한 횟수
 */
export function setHeroWear(g: THREE.Group, hits: number): void {
  const lv = Math.min(WEAR_MAX, Math.max(0, hits));
  const look = g.userData.look;
  const { legL, legR, armL, armR } = g.userData.parts;
  if (!g.userData.wear) g.userData.wear = buildWear(g);
  for (const w of g.userData.wear as WearPiece[]) w.obj.visible = lv >= w.from && lv <= w.to;
  const skin = toon(look.skin);
  const dress = (limb: THREE.Group, bare: boolean, color: number) => {
    for (const c of limb.userData.cloth as THREE.Mesh[]) c.material = bare ? skin : toon(color);
  };
  // 팔다리는 옷이 찢긴 쪽부터 맨살로 바꾼다.
  dress(armL, lv >= 2, look.shirt);
  dress(armR, lv >= 3, look.shirt);
  dress(legL, lv >= 4, look.pants);
  dress(legR, lv >= 5, look.pants);
  // 민소매가 되면 어깨가 먼저 드러나고, 그다음에 윗옷이 통째로 없어진다.
  (look.shoulders as THREE.Mesh).material = lv >= 6 ? skin : toon(look.shirt);
  (look.torso as THREE.Mesh).material = lv >= 7 ? skin : toon(look.shirt);
  for (const t of look.trim as THREE.Mesh[]) t.visible = lv < 7;
  (look.belt as THREE.Mesh).visible = lv < WEAR_MAX;
  (look.hips as THREE.Mesh).visible = lv < WEAR_MAX;
  for (const h of look.hat as THREE.Mesh[]) h.visible = lv < 1;
  for (const s of look.scarf as THREE.Mesh[]) s.visible = lv < 3;
  // 당할수록 피부 전체가 꾀죄죄한 색으로 바뀐다.
  skin.color.setHex(HERO_SKIN).lerp(grime, (lv / WEAR_MAX) * 0.55);
}

const grime = new THREE.Color(0xa58868);

/**
 * 피해 단계마다 보이거나 사라질 부품(삐친 머리, 찢긴 옷자락, 구멍, 때, 생채기, 팬티)을 미리 만들어 모델에 붙인다.
 * @author heojeehaeng(claude)
 * @param {THREE.Group} g 리용길 모델
 * @return {WearPiece[]} 부품과 그 부품이 보이는 피해 단계 범위
 */
function buildWear(g: THREE.Group): WearPiece[] {
  const look = g.userData.look;
  const { legL, legR, armL, armR } = g.userData.parts;
  const out: WearPiece[] = [];
  const put = (parent: THREE.Object3D, obj: THREE.Object3D, from: number, to = WEAR_MAX) => {
    parent.add(obj);
    out.push({ obj, from, to });
  };
  // 팔다리에 붙이는 부품은 팔꿈치나 무릎보다 아래에 있으면 아래 마디에 붙여, 관절이 꺾일 때 함께 움직이게 한다.
  const putLimb = (limb: THREE.Group, obj: THREE.Object3D, from: number, to = WEAR_MAX) => {
    const jy = limb.userData.jointY as number;
    if (obj.position.y >= jy) return put(limb, obj, from, to);
    obj.position.y -= jy;
    put(limb.userData.lower as THREE.Object3D, obj, from, to);
  };
  const up = new THREE.Vector3(0, 1, 0);

  // 삐친 머리: 머리통 바깥으로 뻗는 뿔 모양 머리카락을 단계마다 늘린다.
  const tufts: [number, number, number, number][] = [
    [0.3, 0.9, 0.3, 1], [-0.5, 0.8, 0.2, 1], [0, 0.6, 0.8, 2], [0.6, 0.6, 0.5, 3], [-0.3, 0.95, -0.1, 4],
    [-0.7, 0.5, 0.5, 5], [0.1, 0.98, 0.2, 6], [0.8, 0.55, 0.1, 6], [-0.1, 0.75, 0.65, 7], [0.45, 0.85, -0.2, 8],
  ];
  for (const [x, y, z, from] of tufts) {
    const dir = new THREE.Vector3(x, y, z).normalize();
    const tuft = part(G.cone, look.hair, [dir.x * 0.45, 1.52 + dir.y * 0.45, dir.z * 0.45], [0.07, 0.26, 0.07]);
    tuft.quaternion.setFromUnitVectors(up, dir);
    put(g, tuft, from);
  }

  // 찢긴 소매와 바짓단: 짧게 남은 옷자락 아래에 들쭉날쭉한 끝을 단다.
  const stub = (color: number, r: number, len: number) => {
    const s = new THREE.Group();
    s.add(part(G.tube, color, [0, -len / 2 + 0.02, 0], [r, len, r]));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const rag = part(G.cone, color, [Math.sin(a) * r * 0.8, -len + 0.02 - 0.03, Math.cos(a) * r * 0.8], [r * 0.42, 0.09, r * 0.42]);
      rag.rotation.x = Math.PI;
      s.add(rag);
    }
    return s;
  };
  put(armL, stub(look.shirt, 0.092, 0.15), 2, 5);
  put(armR, stub(look.shirt, 0.092, 0.15), 3, 5);
  put(legL, stub(look.pants, 0.114, 0.2), 4, 7);
  put(legR, stub(look.pants, 0.114, 0.2), 5, 7);
  // 윗옷이 없어지면 바지 허리가 드러나고, 바지까지 없어지면 그 자리에 팬티만 남는다.
  put(g, part(G.tube, look.pants, [0, 0.535, 0], [0.3, 0.15, 0.228]), 7, 7);
  const briefs = new THREE.Mesh(G.tube, briefsMat());
  briefs.position.set(0, 0.56, 0);
  briefs.scale.set(0.31, 0.21, 0.236);
  put(g, briefs, WEAR_MAX);

  // 옷 구멍: 맨살이 비친다. 카메라가 등을 비추므로 등 쪽에 낸다.
  const patch = (color: number, pos: number[], scale: number[]) => part(G.ballLow, color, pos, scale);
  put(g, patch(look.skin, [-0.19, 1.08, 0.14], [0.075, 0.06, 0.03]), 4, 6);
  put(g, patch(look.skin, [0.2, 0.6, 0.17], [0.07, 0.07, 0.03]), 4, 6);
  put(g, patch(look.skin, [0.2, 1.1, 0.13], [0.07, 0.055, 0.03]), 6, 6);
  put(g, patch(look.skin, [-0.21, 0.68, 0.15], [0.06, 0.08, 0.03]), 6, 6);
  put(g, patch(look.skin, [0.1, 0.9, -0.21], [0.08, 0.1, 0.03]), 6, 6);

  // 때: 옷에 묻은 얼룩과 피부에 탄 때
  const stain = 0x4a3a28;
  const dirt = 0x6b5236;
  put(g, patch(stain, [0.21, 1.0, 0.145], [0.06, 0.08, 0.03]), 1, 6);
  put(g, patch(stain, [-0.2, 0.75, 0.16], [0.065, 0.07, 0.03]), 3, 6);
  put(g, patch(dirt, [0.2, 1.36, -0.34], [0.07, 0.05, 0.03]), 1);
  put(g, patch(dirt, [-0.3, 1.3, 0.21], [0.07, 0.06, 0.03]), 2);
  put(g, patch(dirt, [0.33, 1.33, 0.13], [0.06, 0.07, 0.03]), 5);
  putLimb(armL, patch(dirt, [0, -0.34, 0.068], [0.045, 0.06, 0.02]), 3);
  putLimb(armR, patch(dirt, [0, -0.13, 0.072], [0.045, 0.07, 0.02]), 5);
  putLimb(legL, patch(dirt, [0, -0.14, 0.096], [0.06, 0.07, 0.02]), 5);
  putLimb(legR, patch(dirt, [0, -0.32, 0.09], [0.06, 0.06, 0.02]), 6);
  put(g, patch(dirt, [-0.17, 1.02, 0.15], [0.08, 0.07, 0.03]), 7);
  put(g, patch(dirt, [0.22, 0.7, 0.15], [0.06, 0.09, 0.03]), 7);

  // 생채기: 가늘고 붉은 줄
  const scratch = (pos: number[], tilt: number) => {
    const s = part(G.cube, 0xc23a2e, pos, [0.1, 0.018, 0.014]);
    s.rotation.z = tilt;
    return s;
  };
  putLimb(armL, scratch([0, -0.12, 0.084], 0.6), 2);
  put(g, scratch([-0.33, 1.42, -0.25], -0.5), 3);
  putLimb(legL, scratch([0, -0.31, 0.1], -0.5), 4);
  putLimb(armR, scratch([0, -0.3, 0.078], -0.6), 6);
  putLimb(legR, scratch([0, -0.13, 0.106], 0.5), 6);
  put(g, scratch([0.18, 1.1, 0.145], 0.5), 7);
  put(g, scratch([-0.12, 0.6, 0.2], -0.4), 7);
  put(g, scratch([-0.22, 0.85, 0.15], 0.7), 8);
  return out;
}

let briefs: THREE.MeshToonMaterial | null = null;

/**
 * 팬티 재질을 반환한다. 흰 바탕에 빨간 하트 무늬다.
 * @author heojeehaeng(claude)
 * @return {THREE.MeshToonMaterial} 팬티 재질
 */
function briefsMat(): THREE.MeshToonMaterial {
  if (briefs) return briefs;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fbfbf6';
  c.fillRect(0, 0, 256, 64);
  c.fillStyle = '#e0312e';
  c.font = 'bold 26px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) c.fillText('♥', 16 + i * 32, i % 2 ? 22 : 42);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  briefs = new THREE.MeshToonMaterial({ map: tex, gradientMap: toon(0xffffff).gradientMap });
  briefs.userData.shared = true;
  return briefs;
}

let camoTex: THREE.CanvasTexture | null = null;
const camos = new Map<string, THREE.MeshToonMaterial>();

/**
 * 한국군 전투복의 화강암 디지털 무늬 재질을 반환한다.
 * 흙색 바탕에 수풀색, 침엽수색, 나무줄기색, 목탄색의 네모난 점이 가로로 길게 뭉친 얼룩을 이룬다.
 * 부위마다 둘레와 길이가 달라서, 점 크기가 5cm 안팎으로 같아지도록 반복 횟수를 따로 받는다.
 * @author heojeehaeng(claude)
 * @param {number} ru 둘레 방향 반복 횟수
 * @param {number} rv 길이 방향 반복 횟수
 * @return {THREE.MeshToonMaterial} 위장 무늬 재질. 같은 반복 횟수끼리 한 장을 함께 쓴다
 */
function camoMat(ru: number, rv: number): THREE.MeshToonMaterial {
  const key = `${ru}x${rv}`;
  let m = camos.get(key);
  if (m) return m;
  if (!camoTex) camoTex = camoTexture();
  // 그림은 한 장을 함께 쓰고 반복 횟수만 부위별로 다르게 둔다.
  const tex = camoTex.clone();
  tex.repeat.set(ru, rv);
  tex.needsUpdate = true;
  m = new THREE.MeshToonMaterial({ map: tex, gradientMap: toon(0xffffff).gradientMap });
  m.userData.shared = true;
  camos.set(key, m);
  return m;
}

/**
 * 화강암 디지털 무늬를 그린다. 가로세로 24칸의 격자에 색 점을 찍는다.
 * @author heojeehaeng(claude)
 * @return {THREE.CanvasTexture} 이어 붙여도 끊기지 않는 위장 무늬
 */
function camoTexture(): THREE.CanvasTexture {
  const N = 24;
  const cell = 8;
  // 색 번호: 0 흙색, 1 수풀색, 2 침엽수색, 3 나무줄기색, 4 목탄색
  const colors = ['#b3a47f', '#6f7d4e', '#3d4d36', '#5f4b37', '#22251f'];
  const grid = new Uint8Array(N * N);
  // 시드를 고정해 새로 만들어도 같은 무늬가 나오게 한다.
  let seed = 20110;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // [색 번호, 얼룩 수, 얼룩 하나의 점 수]: 넓은 색부터 깔고 어두운 색을 작게 얹는다.
  const layers = [[1, 14, 16], [2, 13, 14], [3, 9, 8], [4, 12, 2]];
  for (const [color, blobs, size] of layers) {
    for (let b = 0; b < blobs; b++) {
      let x = Math.floor(rnd() * N);
      let y = Math.floor(rnd() * N);
      for (let i = 0; i < size; i++) {
        grid[y * N + x] = color;
        // 얼룩이 가로로 길어지도록 좌우로 더 자주 번진다.
        if (rnd() < 0.68) x = (x + (rnd() < 0.5 ? 1 : N - 1)) % N;
        else y = (y + (rnd() < 0.5 ? 1 : N - 1)) % N;
      }
    }
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = N * cell;
  const c = cv.getContext('2d')!;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      c.fillStyle = colors[grid[y * N + x]];
      c.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // 점의 네모난 모서리가 뭉개지지 않게 한다.
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/**
 * 사람 모델의 팔다리를 달리기 박자에 맞춰 흔든다. 발을 앞으로 가져올 때 무릎을 접고, 달리는 동안 팔꿈치를 굽힌다.
 * @author heojeehaeng(claude)
 * @param {THREE.Group} p makePerson으로 만든 모델
 * @param {number} phase 흔들림 위상(rad)
 * @param {number} amp 흔들림 크기(rad). 0이면 차렷 자세가 된다
 */
export function swingPerson(p: THREE.Group, phase: number, amp: number): void {
  const { legL, legR, armL, armR, kneeL, kneeR, elbowL, elbowR } = p.userData.parts;
  // 포복 자세에서 돌아올 때는 옆으로 벌렸던 관절을 먼저 제자리로 돌린다.
  if (p.userData.posed) {
    for (const j of [legL, legR, armL, armR, kneeL, kneeR, elbowL, elbowR]) j.rotation.set(0, 0, 0);
    p.userData.posed = false;
  }
  const sin = Math.sin(phase);
  const s = sin * amp;
  legL.rotation.x = s;
  legR.rotation.x = -s;
  armL.rotation.x = -s;
  armR.rotation.x = s;
  // 행진 대열처럼 관절 없이 만든 모델은 여기까지만 움직인다.
  if (!kneeL) return;
  const k = Math.min(1, amp);
  const cos = Math.cos(phase);
  // 뒤로 찬 다리가 앞으로 넘어오는 동안에만 무릎이 접힌다.
  kneeL.rotation.x = -(0.12 + Math.max(0, cos) * 1.35) * k;
  kneeR.rotation.x = -(0.12 + Math.max(0, -cos) * 1.35) * k;
  // 앞으로 나온 팔은 더 굽히고 뒤로 간 팔은 조금 편다.
  elbowL.rotation.x = (1.05 - sin * 0.35) * k;
  elbowR.rotation.x = (1.05 + sin * 0.35) * k;
}

/**
 * 엎드린 사람 모델의 팔다리를 포복 박자에 맞춰 움직인다.
 * 한쪽 팔을 앞으로 뻗는 동안 반대쪽 무릎을 옆으로 끌어 올리고, 다음 박자에 좌우를 바꾼다.
 * @author heojeehaeng(claude)
 * @param {THREE.Group} p makePerson으로 만든 모델. 관절 없이 만든 모델은 움직이지 않는다
 * @param {number} phase 포복 위상(rad)
 */
export function crawlPerson(p: THREE.Group, phase: number): void {
  const { legL, legR, armL, armR, kneeL, kneeR, elbowL, elbowR } = p.userData.parts;
  if (!kneeL) return;
  const s = Math.sin(phase);
  // dir은 왼쪽이 -1, 오른쪽이 1이다. 팔다리를 몸 옆으로 벌려 땅과 나란한 면 안에서 움직이고, 끝이 땅에 닿도록 조금 내린다.
  const side = (arm: THREE.Group, elbow: THREE.Group, leg: THREE.Group, knee: THREE.Group, dir: number, reach: number) => {
    const pull = 1 - reach;
    // 위팔이 앞으로 나가는 만큼 팔꿈치를 펴서, 아래팔은 늘 앞을 향한 채 손만 앞뒤로 오간다.
    arm.rotation.set(0, dir * 0.3, dir * (1.45 + reach));
    elbow.rotation.set(0, 0, dir * (1.5 - reach));
    leg.rotation.set(0, dir * 0.25, dir * (0.1 + 1.25 * pull));
    knee.rotation.set(0, 0, -dir * (0.1 + 1.6 * pull));
  };
  side(armL, elbowL, legL, kneeL, -1, 0.5 + 0.5 * s);
  side(armR, elbowR, legR, kneeR, 1, 0.5 - 0.5 * s);
  p.userData.posed = true;
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
  for (const s of [-1, 1]) {
    // 화난 눈썹과 벌린 입 사이로 보이는 송곳니
    const brow = part(G.cube, 0x2a1a10, [s * 0.2, 3.14, 0.53], [0.17, 0.04, 0.03]);
    brow.rotation.z = s * 0.4;
    const fang = part(G.cone, 0xffffff, [s * 0.06, 2.75, 0.68], [0.022, 0.08, 0.022]);
    fang.rotation.x = Math.PI;
    g.add(brow, fang);
  }
  // 가슴의 반달 무늬
  for (const s of [-1, 1]) {
    const moon = pill(0xf6ead2, 0.05, 0.42, [s * 0.16, 2.42, 0.5]);
    moon.rotation.z = s * 0.9;
    g.add(moon);
  }
  // 건빵 봉지
  g.add(part(G.cube, 0xd8c690, [0.62, 1.9, 0.52], [0.42, 0.5, 0.16]), part(G.cube, 0xb8412e, [0.62, 1.95, 0.61], [0.3, 0.14, 0.02]));
  const arms = new THREE.Group();
  for (const s of [-1, 1]) {
    // 어깨에서 바깥 아래, 앞쪽으로 뻗어 달려오는 사람을 끌어안는 자세를 만든다.
    const arm = new THREE.Group();
    arm.position.set(s * 0.6, 2.32, 0.1);
    arm.rotation.set(0, -s * 0.35, -s * 0.5);
    arm.add(pill(fur, 0.21, 1.5, [s * 0.7, 0, 0], 'x'), part(G.ball, dark, [s * 1.46, 0, 0.06], [0.27, 0.3, 0.3]));
    // 어깨와 발바닥 살
    arm.add(part(G.ball, fur, [s * 0.05, 0, -0.04], [0.3, 0.28, 0.3]), part(G.ball, pale, [s * 1.46, 0, 0.28], [0.15, 0.17, 0.09]));
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

interface QuadLeg {
  hip: THREE.Group;
  knee: THREE.Group;
  /** 다리마다 다른 박자 어긋남(rad) */
  off: number;
}

interface QuadRig {
  legs: QuadLeg[];
  head?: THREE.Object3D;
  tail?: THREE.Object3D;
}

/**
 * 네발 동물의 다리 네 개를 붙인다. 다리마다 엉덩이 관절과 무릎 관절이 있어 달릴 때 접힌다.
 * 몸은 +z를 보는 것으로 가정한다.
 * @author heojeehaeng(claude)
 * @param {THREE.Group} g 다리를 붙일 몸
 * @param {number} col 다리 색
 * @param {number} foot 발(발굽) 색
 * @param {number} hipY 엉덩이 관절 높이(m). 다리 길이와 같다
 * @param {number} sx 좌우로 벌어진 거리의 절반(m)
 * @param {number} fz 앞다리의 z
 * @param {number} hz 뒷다리가 뒤로 물러난 거리(m)
 * @param {number} rU 윗다리 굵기(반지름)
 * @param {number} rL 아랫다리 굵기(반지름)
 * @return {QuadLeg[]} 다리 관절 목록 (앞왼, 앞오른, 뒤왼, 뒤오른)
 */
function addLegs(g: THREE.Group, col: number, foot: number, hipY: number, sx: number, fz: number, hz: number, rU: number, rL: number): QuadLeg[] {
  const legs: QuadLeg[] = [];
  const seg = hipY / 2;
  // 앞다리 한 쌍과 뒷다리 한 쌍이 번갈아 땅을 차도록 박자를 반 바퀴 어긋나게 둔다.
  for (const [x, z, off] of [[-sx, fz, 0], [sx, fz, 0.6], [-sx, -hz, Math.PI], [sx, -hz, Math.PI + 0.6]]) {
    const hip = new THREE.Group();
    hip.position.set(x, hipY, z);
    const knee = new THREE.Group();
    knee.position.y = -seg;
    hip.add(pill(col, rU, seg + rU * 1.6, [0, -seg / 2, 0]), knee);
    knee.add(pill(col, rL, seg + rL, [0, -seg / 2 + rL * 0.3, 0]), part(G.ballLow, foot, [0, -seg + 0.05, rL * 0.35], [rL * 1.35, 0.06, rL * 1.75]));
    g.add(hip);
    legs.push({ hip, knee, off });
  }
  return legs;
}

/**
 * 네발 동물이 달리는 동작을 한 프레임만큼 맞춘다. 다리를 앞뒤로 젓고, 머리를 끄덕이고, 꼬리를 흔든다.
 * @author heojeehaeng(claude)
 * @param {THREE.Group} g addLegs로 다리를 붙인 동물 모델
 * @param {number} phase 달리기 박자(rad). 시간에 비례해 키운다
 * @param {number} amp 동작 크기. 0이면 가만히 선 자세다
 */
export function runQuad(g: THREE.Group, phase: number, amp = 1): void {
  const rig = g.userData.rig as QuadRig | undefined;
  if (!rig) return;
  for (const l of rig.legs) {
    l.hip.rotation.x = Math.sin(phase + l.off) * 0.85 * amp;
    // 발을 앞으로 가져오는 동안에는 무릎을 접어 땅에 끌리지 않게 한다.
    l.knee.rotation.x = Math.max(0, -Math.cos(phase + l.off)) * 1.15 * amp;
  }
  if (rig.head) rig.head.rotation.x = Math.sin(phase * 2) * 0.07 * amp;
  if (rig.tail) rig.tail.rotation.y = Math.sin(phase * 0.5) * 0.35;
}

/**
 * 등을 덮는 줄무늬 하나를 만든다. 몸은 +z를 보는 것으로 가정한다.
 * @author heojeehaeng(claude)
 * @param {number} color 줄무늬 색
 * @param {number[]} pos 몸통 중심선 위의 위치 [x, y, z]
 * @param {number} r 반지름. 몸통보다 조금 커야 겉으로 드러난다
 * @param {number} w 줄무늬 폭(m)
 * @return {THREE.Mesh} 줄무늬
 */
function stripe(color: number, pos: number[], r: number, w: number): THREE.Mesh {
  const s = part(G.half, color, pos, [r, w, r]);
  // 반원기둥의 축을 몸통 방향으로 눕혀 둥근 쪽이 위를 향하게 한다.
  s.rotation.x = -Math.PI / 2;
  return s;
}

/**
 * 민화풍 호랑이 모델을 만든다. 등에 줄무늬, 이마에 임금 왕(王) 자 무늬가 있고 까치 한 마리가 위에서 따라다닌다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 호랑이 모델. 머리는 +x 방향이다. userData.rig로 달리는 동작을 준다
 */
export function makeTiger(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Group();
  // 몸은 +z를 보게 만든 뒤 통째로 돌려 머리가 +x를 향하게 한다.
  m.rotation.y = Math.PI / 2;
  const fur = 0xee9a2e;
  const pale = 0xfff3d6;
  const dark = 0x1e1a16;
  m.add(pill(fur, 0.36, 1.7, [0, 0.84, 0], 'z'), part(G.ball, fur, [0, 0.9, 0.5], [0.41, 0.41, 0.42]), part(G.ball, fur, [0, 0.86, -0.52], [0.39, 0.39, 0.4]));
  m.add(part(G.ball, pale, [0, 0.66, 0.05], [0.27, 0.2, 0.74]));
  for (const z of [-0.62, -0.36, -0.1, 0.16, 0.42]) m.add(stripe(dark, [0, 0.87, z], z > 0.3 || z < -0.4 ? 0.425 : 0.385, 0.075));
  const legs = addLegs(m, fur, pale, 0.6, 0.23, 0.52, 0.52, 0.125, 0.1);
  for (const l of legs) l.hip.add(part(G.tube, dark, [0, -0.13, 0], [0.136, 0.05, 0.136]));
  const head = new THREE.Group();
  head.position.set(0, 1.08, 0.98);
  head.add(part(G.ball, fur, [0, 0, 0], [0.42, 0.38, 0.38]), part(G.ball, pale, [0, -0.1, 0.3], [0.19, 0.14, 0.14]));
  head.add(part(G.ballLow, 0xd9737f, [0, -0.03, 0.43], [0.06, 0.04, 0.04]), part(G.cube, dark, [0, -0.15, 0.42], [0.1, 0.016, 0.02]));
  for (const s of [-1, 1]) {
    head.add(part(G.ball, pale, [s * 0.24, -0.1, 0.16], [0.18, 0.17, 0.18]), part(G.cube, dark, [s * 0.385, 0.02, 0.08], [0.03, 0.04, 0.16]));
    head.add(part(G.ballLow, fur, [s * 0.28, 0.3, -0.05], [0.13, 0.14, 0.07]), part(G.ballLow, 0x3a2a20, [s * 0.28, 0.29, -0.005], [0.07, 0.08, 0.04]));
  }
  // 이마의 임금 왕(王) 자 무늬
  for (const [y, z, w] of [[0.27, 0.275, 0.15], [0.21, 0.322, 0.1], [0.15, 0.352, 0.15]]) head.add(part(G.cube, dark, [0, y, z], [w, 0.028, 0.03]));
  const bar = part(G.cube, dark, [0, 0.21, 0.325], [0.028, 0.15, 0.03]);
  bar.rotation.x = -0.6;
  head.add(bar);
  addEyes(head, [0, 0.06, 0.335], 'z', 0.16, 0.055);
  const tail = new THREE.Group();
  tail.position.set(0, 0.95, -0.86);
  const t1 = pill(fur, 0.075, 0.62, [0, 0.12, -0.22]);
  t1.rotation.x = -1.0;
  const t2 = pill(fur, 0.07, 0.5, [0, 0.5, -0.5]);
  t2.rotation.x = -0.25;
  const ring1 = part(G.tube, dark, [0, 0.2, -0.34], [0.085, 0.06, 0.085]);
  ring1.rotation.x = -1.0;
  const ring2 = part(G.tube, dark, [0, 0.46, -0.49], [0.08, 0.06, 0.08]);
  ring2.rotation.x = -0.25;
  tail.add(t1, t2, ring1, ring2, part(G.ballLow, dark, [0, 0.76, -0.56], [0.09, 0.1, 0.09]));
  m.add(head, tail);
  const magpie = new THREE.Group();
  magpie.add(part(G.ballLow, 0x151515, [0, 0, 0], [0.2, 0.13, 0.13]), part(G.ballLow, 0xffffff, [0.02, -0.05, 0], [0.13, 0.08, 0.1]));
  magpie.add(part(G.cone, 0xe0a030, [0.24, 0.02, 0], [0.03, 0.1, 0.03]), part(G.cube, 0x151515, [-0.26, 0.04, 0], [0.22, 0.03, 0.08]));
  magpie.children[2].rotation.z = -Math.PI / 2;
  magpie.position.set(0.4, 2.2, 0);
  g.add(m, magpie, blob(1.3, 0.5));
  g.userData.magpie = magpie;
  g.userData.rig = { legs, head, tail };
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
  const dark = 0x4a3520;
  const legs = addLegs(g, col, dark, 1.18, 0.34, 0.62, 0.62, 0.115, 0.085);
  for (const [i, l] of legs.entries()) l.hip.add(part(G.ballLow, spot, [i % 2 ? 0.08 : -0.08, -0.22, 0.03], [0.07, 0.11, 0.07]));
  g.add(pill(col, 0.48, 2.0, [0, 1.62, 0], 'z'));
  const spots = [[0.42, 1.78, 0.42, 0.17], [-0.44, 1.62, -0.2, 0.19], [0.42, 1.5, -0.5, 0.15], [-0.38, 1.84, 0.55, 0.16], [0, 2.09, 0.1, 0.18], [0.1, 2.05, -0.55, 0.14], [-0.43, 1.45, 0.3, 0.13], [0.45, 1.66, -0.05, 0.14], [-0.2, 2.0, -0.75, 0.13]];
  for (const [sx, sy, sz, r] of spots) g.add(part(G.ballLow, spot, [sx, sy, sz], [r, r * 0.9, r]));
  const tail = new THREE.Group();
  tail.position.set(0, 1.78, -1.0);
  const strand = pill(col, 0.04, 0.8, [0, -0.33, -0.13]);
  strand.rotation.x = -0.35;
  tail.add(strand, part(G.ballLow, dark, [0, -0.7, -0.27], [0.08, 0.12, 0.08]));
  g.add(tail);
  const neck = new THREE.Group();
  neck.position.set(0, 1.6, 0);
  neck.add(pill(col, 0.19, neckLen + 0.3, [neckLen / 2, 0, 0], 'x'));
  // 목덜미를 따라 난 갈기
  neck.add(part(G.cube, spot, [neckLen / 2 + 0.2, 0.2, 0], [neckLen - 0.2, 0.07, 0.05]));
  for (let i = 0.9; i < neckLen; i += 0.75) {
    const k = Math.round(i / 0.75);
    neck.add(part(G.ballLow, spot, [i, 0.1 * (k % 2 ? 1 : -1), 0.13 * (k % 3 ? 1 : -1)], [0.15, 0.11, 0.1]));
  }
  neck.add(part(G.ball, col, [neckLen + 0.35, 0, 0], [0.5, 0.26, 0.27]), part(G.ball, 0xf6e2b0, [neckLen + 0.72, -0.03, 0], [0.2, 0.17, 0.2]));
  for (const s of [-1, 1]) {
    neck.add(pill(spot, 0.04, 0.34, [neckLen + 0.2, 0.36, s * 0.12]), part(G.ballLow, dark, [neckLen + 0.2, 0.55, s * 0.12], [0.07, 0.07, 0.07]));
    neck.add(part(G.ballLow, col, [neckLen + 0.05, 0.18, s * 0.3], [0.08, 0.06, 0.14]), part(G.ballLow, dark, [neckLen + 0.88, 0, s * 0.08], [0.03, 0.03, 0.03]));
  }
  addEyes(neck, [neckLen + 0.52, 0.1, 0], 'x', 0.22, 0.05);
  // 탈북 보따리
  neck.add(part(G.ball, 0xc0392b, [neckLen * 0.45, -0.48, 0], [0.36, 0.32, 0.32]), part(G.ballLow, 0xa52f23, [neckLen * 0.45, -0.14, 0], [0.1, 0.1, 0.1]));
  g.add(neck, blob(0.8, 1.2));
  g.userData.neck = neck;
  return g;
}

/**
 * 부대에 사는 고양이 모델을 만든다. 줄무늬가 있고 방울 달린 목줄을 찼다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 고양이 모델. 머리는 +x 방향이다. userData.rig로 달리는 동작을 준다
 */
export function makeCat(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Group();
  // 몸은 +z를 보게 만든 뒤 통째로 돌려 머리가 +x를 향하게 한다.
  m.rotation.y = Math.PI / 2;
  const fur = 0x9299a2;
  const dark = 0x5d636c;
  m.add(pill(fur, 0.15, 0.68, [0, 0.38, 0], 'z'), part(G.ball, 0xffffff, [0, 0.33, 0.22], [0.1, 0.1, 0.12]));
  for (const z of [-0.2, -0.03, 0.14]) m.add(stripe(dark, [0, 0.385, z], 0.158, 0.04));
  const legs = addLegs(m, fur, 0xffffff, 0.26, 0.09, 0.22, 0.22, 0.05, 0.042);
  const head = new THREE.Group();
  head.position.set(0, 0.57, 0.42);
  head.add(part(G.ball, fur, [0, 0, 0], [0.19, 0.17, 0.17]), part(G.ballLow, 0xffffff, [0, -0.05, 0.13], [0.09, 0.065, 0.07]));
  head.add(part(G.ballLow, 0xe58a9a, [0, -0.02, 0.2], [0.025, 0.02, 0.02]));
  for (const s of [-1, 1]) head.add(part(G.cone, fur, [s * 0.11, 0.2, -0.02], [0.07, 0.15, 0.05]), part(G.cone, 0xe9a9b3, [s * 0.11, 0.19, 0.005], [0.04, 0.1, 0.03]));
  addEyes(head, [0, 0.03, 0.148], 'z', 0.085, 0.035);
  const collar = part(G.tube, 0xc0392b, [0, 0.47, 0.3], [0.1, 0.035, 0.1]);
  collar.rotation.x = 1.1;
  const tail = new THREE.Group();
  tail.position.set(0, 0.46, -0.34);
  const strand = pill(fur, 0.035, 0.5, [0, 0.2, -0.08]);
  strand.rotation.x = -0.35;
  tail.add(strand, part(G.ballLow, dark, [0, 0.43, -0.16], [0.045, 0.06, 0.045]));
  m.add(head, collar, part(G.ballLow, 0xf2c230, [0, 0.4, 0.38], [0.035, 0.035, 0.035]), tail);
  g.add(m, blob(0.6, 0.28));
  g.userData.rig = { legs, head, tail };
  return g;
}

/**
 * 고라니 모델을 만든다. 뿔 대신 송곳니가 있고 엉덩이가 희다. 머리는 +z(달려오는 플레이어 쪽) 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 고라니 모델. userData.rig로 달리는 동작을 준다
 */
export function makeDeer(): THREE.Group {
  const g = new THREE.Group();
  const col = 0xb08a58;
  const pale = 0xf0dfc0;
  const dark = 0x2a2018;
  g.add(pill(col, 0.25, 1.15, [0, 0.95, 0], 'z'), part(G.ball, pale, [0, 0.82, 0], [0.19, 0.14, 0.5]), part(G.ball, col, [0, 0.98, 0.36], [0.26, 0.27, 0.28]));
  const legs = addLegs(g, col, dark, 0.74, 0.14, 0.4, 0.42, 0.062, 0.045);
  const neck = pill(col, 0.115, 0.62, [0, 1.27, 0.5]);
  neck.rotation.x = 0.55;
  const head = new THREE.Group();
  head.position.set(0, 1.52, 0.7);
  head.add(part(G.ball, col, [0, 0, 0], [0.17, 0.17, 0.24]), part(G.ball, pale, [0, -0.04, 0.19], [0.1, 0.09, 0.1]), part(G.ballLow, dark, [0, -0.01, 0.29], [0.045, 0.035, 0.03]));
  for (const s of [-1, 1]) {
    const ear = part(G.ballLow, col, [s * 0.18, 0.2, -0.06], [0.07, 0.15, 0.035]);
    ear.rotation.z = -s * 0.5;
    const inner = part(G.ballLow, pale, [s * 0.18, 0.2, -0.035], [0.04, 0.1, 0.02]);
    inner.rotation.z = -s * 0.5;
    // 고라니는 뿔 대신 송곳니가 있다.
    const fang = part(G.cone, 0xffffff, [s * 0.05, -0.15, 0.22], [0.018, 0.11, 0.018]);
    fang.rotation.x = Math.PI;
    head.add(ear, inner, fang);
  }
  addEyes(head, [0, 0.05, 0.17], 'z', 0.125, 0.04);
  g.add(neck, head, part(G.ball, pale, [0, 1.0, -0.56], [0.16, 0.16, 0.08]), part(G.ballLow, col, [0, 1.12, -0.6], [0.05, 0.07, 0.05]), blob(0.4, 0.8));
  g.userData.rig = { legs, head };
  return g;
}

/**
 * 멧돼지 모델을 만든다. 어깨가 솟고 엄니와 갈기가 있다. 머리는 +z(달려오는 플레이어 쪽) 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 멧돼지 모델. userData.rig로 달리는 동작을 준다
 */
export function makeBoar(): THREE.Group {
  const g = new THREE.Group();
  const col = 0x54402f;
  const dark = 0x2a2018;
  g.add(pill(col, 0.46, 1.5, [0, 0.82, -0.05], 'z'), part(G.ball, col, [0, 1.0, 0.3], [0.5, 0.48, 0.55]), part(G.ball, col, [0, 0.8, -0.6], [0.42, 0.42, 0.4]));
  const legs = addLegs(g, col, dark, 0.5, 0.27, 0.5, 0.55, 0.11, 0.085);
  const head = new THREE.Group();
  head.position.set(0, 0.84, 0.95);
  head.add(part(G.ball, col, [0, 0, 0], [0.38, 0.36, 0.42]));
  const snout = part(G.tube, 0x8a6a5a, [0, -0.12, 0.42], [0.17, 0.2, 0.15]);
  snout.rotation.x = Math.PI / 2;
  head.add(snout);
  for (const s of [-1, 1]) {
    const tusk = part(G.cone, 0xfff3d6, [s * 0.23, -0.08, 0.36], [0.045, 0.26, 0.045]);
    tusk.rotation.z = -s * 0.35;
    // 화난 눈썹: 안쪽 끝을 내려 찌푸린 표정을 만든다.
    const brow = part(G.cube, dark, [s * 0.19, 0.21, 0.36], [0.15, 0.035, 0.03]);
    brow.rotation.z = s * 0.45;
    head.add(tusk, brow, part(G.ballLow, dark, [s * 0.06, -0.12, 0.53], [0.03, 0.04, 0.02]), part(G.ballLow, col, [s * 0.3, 0.32, -0.12], [0.1, 0.14, 0.06]));
  }
  addEyes(head, [0, 0.12, 0.35], 'z', 0.19, 0.045);
  // 등줄기를 따라 선 갈기
  for (let z = -0.7; z <= 0.62; z += 0.22) g.add(part(G.cone, dark, [0, z > 0 ? 1.56 : 1.36, z], [0.09, 0.3, 0.09]));
  const tail = new THREE.Group();
  tail.position.set(0, 0.95, -0.98);
  const strand = pill(col, 0.03, 0.4, [0, -0.12, -0.1]);
  strand.rotation.x = -0.6;
  tail.add(strand, part(G.ballLow, dark, [0, -0.28, -0.2], [0.05, 0.07, 0.05]));
  g.add(head, tail, blob(0.75, 1.15));
  g.userData.rig = { legs, head, tail };
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

/** 굳건이의 엉덩이 높이(m). 리용길의 키보다 높아 서서는 지날 수 없고 몸을 낮춰야 다리 사이로 빠져나간다 */
const MASCOT_HIP = 2.3;
/** 굳건이가 벌려 디딘 발의 좌우 위치(m) */
const MASCOT_FOOT = 1.25;

/**
 * 엄지를 치켜든 육군 마스코트 '굳건이' 모델을 만든다. 다리가 아주 길고 넓게 벌어져 가랑이 사이가 문처럼 뚫려 있다. 얼굴은 +z 방향이다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 마스코트 모델. userData.legs에 긴 다리 관절이, userData.body에 윗몸이, userData.guide에 다리 사이로 이끄는 바닥 화살표가 들어 있다
 */
export function makeMascot(): THREE.Group {
  const g = new THREE.Group();
  const green = 0x5c8a3c;
  const body = makePerson({ shirt: green, pants: green, face: 'grin', hair: 0x111111, noShadow: true });
  // 얼룩무늬
  for (const [x, y, c] of [[-0.14, 0.95, 0x2f5a25], [0.12, 0.75, 0x3d3a22], [0.02, 1.08, 0x3d3a22], [-0.1, 0.68, 0x2f5a25]]) {
    body.add(part(G.ballLow, c, [x, y, -0.21], [0.11, 0.08, 0.04]));
  }
  // 뾰족한 머리카락
  for (let i = -2; i <= 2; i++) body.add(part(G.cone, 0x111111, [i * 0.15, 1.99 - Math.abs(i) * 0.04, -0.02], [0.1, 0.3, 0.1]));
  // 치켜든 엄지
  const { armR, legL, legR } = body.userData.parts;
  armR.rotation.x = 1.5;
  armR.add(part(G.ballLow, 0xf3cfae, [0, -0.5, 0.12], [0.045, 0.045, 0.1]));
  // 원래의 짧은 다리는 떼어 내고 아래에서 긴 다리를 따로 붙인다.
  body.remove(legL, legR);
  const scale = 1.45;
  body.scale.setScalar(scale);
  body.rotation.y = Math.PI;
  // 사람 모델의 엉덩이 높이(0.5)가 긴 다리의 엉덩이 높이에 오도록 윗몸을 들어 올린다.
  body.position.y = MASCOT_HIP - 0.5 * scale;
  const hipX = 0.135 * scale;
  const spread = Math.atan2(MASCOT_FOOT - hipX, MASCOT_HIP);
  const len = Math.hypot(MASCOT_FOOT - hipX, MASCOT_HIP) - 0.12;
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * hipX, MASCOT_HIP, 0);
    leg.rotation.z = s * spread;
    leg.add(pill(green, 0.15, len + 0.15, [0, -len / 2, 0]));
    // 긴 다리에도 얼룩무늬를 띄엄띄엄 둘러 전투복으로 보이게 한다.
    [0.2, 0.42, 0.63].forEach((k, i) => leg.add(part(G.tube, i % 2 ? 0x3d3a22 : 0x2f5a25, [0, -len * k, 0], [0.156, 0.2, 0.156])));
    // 다리가 기울어도 군화는 바닥에 평평하게 놓이도록 반대로 돌려 둔다.
    const boot = new THREE.Group();
    boot.position.y = -len;
    boot.rotation.z = -s * spread;
    boot.add(part(G.tube, SHOE, [0, 0.2, 0], [0.17, 0.42, 0.17]), part(G.ball, SHOE, [0, 0.02, 0.1], [0.2, 0.13, 0.32]));
    leg.add(boot);
    legs.push(leg);
    g.add(leg);
  }
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.2), bearGuideMat());
  guide.rotation.x = -Math.PI / 2;
  guide.position.set(0, 0.045, 1.7);
  g.add(body, guide, blob(1.5, 0.6));
  g.userData.legs = legs;
  g.userData.body = body;
  g.userData.guide = guide;
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

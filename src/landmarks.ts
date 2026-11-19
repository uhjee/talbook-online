import * as THREE from 'three';
import { DEPOTS, FONT_DISPLAY, PLAZA, STAGES } from './config';
import { box, makePanel, makeSign, mat } from './models';
import { rng } from './scenery';

/** 소품을 정해진 자리에 놓는 함수. 놓은 물체를 그대로 돌려준다 */
export type Put = <T extends THREE.Object3D>(obj: T, x: number, d: number, ry?: number) => T;

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

const TAU = Math.PI * 2;
const RED = 0xc8202c;
const RED_CSS = '#c8202c';
const GOLD_CSS = '#ffe14d';
/** 배경 묶음 하나가 덮는 거리(m). world.ts의 묶음 크기와 같아야 한다 */
const CHUNK = 50;

/**
 * 구간마다 그곳이 어디인지 알려 주는 큰 배경을 배치한다.
 * 탄광의 원수님 초상화, 시내의 광장과 작별 표지판, DMZ의 산줄기, SS사단의 창고와 탄약고가 들어간다.
 * 실제 인물의 사진이나 실제 깃발은 쓰지 않고, 가상의 원수님과 붉은 휘장으로 분위기만 낸다.
 * @author heojeehaeng(claude)
 * @param {Put} put 소품 배치 함수
 */
export function buildLandmarks(put: Put): void {
  minePortraits(put);
  citySquare(put);
  farewellSign(put);
  dmzMountains(put);
  for (const depot of DEPOTS) put(depot.kind === 'store' ? makeStore() : makeBunker(), depot.side * (depot.kind === 'store' ? 22 : 20), depot.d, -depot.side * Math.PI * 0.5);
}

/**
 * 그림자를 드리우지 않게 한다. 수가 많거나 아주 큰 배경은 그림자를 그리면 느려지기만 한다.
 * 배치할 때 그림자가 켜지므로 반드시 put으로 놓은 뒤에 불러야 한다.
 * @author heojeehaeng(claude)
 * @param {THREE.Object3D} root 물체
 */
function noShadow(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.castShadow = false;
  });
}

/**
 * 타원을 칠한다.
 * @author heojeehaeng(claude)
 * @param {CanvasRenderingContext2D} g 캔버스
 * @param {number} x 중심 x
 * @param {number} y 중심 y
 * @param {number} rx 가로 반지름
 * @param {number} ry 세로 반지름
 * @param {string} color 색
 */
function oval(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fill();
}

/**
 * 금빛 액자에 든 가상의 원수님 초상화를 그린다. 둥글고 넉넉한 얼굴, 뒤로 넘긴 검은 머리, 깃을 세운 검은 인민복 차림이다.
 * @author heojeehaeng(claude)
 * @param {CanvasRenderingContext2D} g 캔버스
 * @param {number} w 캔버스 가로(px)
 * @param {number} h 캔버스 세로(px)
 * @param {boolean} grin true면 활짝 웃는 얼굴, false면 근엄한 얼굴
 */
function drawLeader(g: CanvasRenderingContext2D, w: number, h: number, grin: boolean): void {
  g.fillStyle = '#a07a22';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ecc95a';
  g.fillRect(w * 0.03, h * 0.025, w * 0.94, h * 0.95);
  g.fillStyle = '#8a6a1e';
  g.fillRect(w * 0.085, h * 0.07, w * 0.83, h * 0.86);
  const x0 = w * 0.1;
  const y0 = h * 0.08;
  const pw = w * 0.8;
  const ph = h * 0.84;
  const cx = w / 2;
  const at = (k: number) => y0 + ph * k;
  g.save();
  g.beginPath();
  g.rect(x0, y0, pw, ph);
  g.clip();
  const glow = g.createLinearGradient(0, y0, 0, y0 + ph);
  glow.addColorStop(0, '#f8eed2');
  glow.addColorStop(1, '#eab58a');
  g.fillStyle = glow;
  g.fillRect(x0, y0, pw, ph);
  // 인민복 어깨, 목, 세운 깃
  oval(g, cx, at(1.04), pw * 0.62, ph * 0.3, '#2a2d38');
  g.fillStyle = '#e0b08a';
  g.fillRect(cx - pw * 0.12, at(0.58), pw * 0.24, ph * 0.16);
  g.fillStyle = '#1b1e27';
  g.fillRect(cx - pw * 0.19, at(0.72), pw * 0.38, ph * 0.055);
  oval(g, cx, at(0.84), pw * 0.022, pw * 0.022, '#d9c36a');
  // 귀, 얼굴, 넉넉한 볼살
  const skin = '#f1c9a5';
  oval(g, cx - pw * 0.31, at(0.44), pw * 0.045, ph * 0.05, skin);
  oval(g, cx + pw * 0.31, at(0.44), pw * 0.045, ph * 0.05, skin);
  oval(g, cx, at(0.41), pw * 0.29, ph * 0.2, skin);
  oval(g, cx, at(0.5), pw * 0.32, ph * 0.155, skin);
  // 옆은 짧게 치고 위는 높게 넘긴 머리
  g.fillStyle = '#16110e';
  g.beginPath();
  g.moveTo(cx - pw * 0.3, at(0.37));
  g.quadraticCurveTo(cx - pw * 0.35, at(0.1), cx, at(0.1));
  g.quadraticCurveTo(cx + pw * 0.35, at(0.1), cx + pw * 0.3, at(0.37));
  g.quadraticCurveTo(cx + pw * 0.24, at(0.25), cx, at(0.27));
  g.quadraticCurveTo(cx - pw * 0.24, at(0.25), cx - pw * 0.3, at(0.37));
  g.fill();
  // 볼의 홍조
  g.globalAlpha = 0.35;
  oval(g, cx - pw * 0.19, at(0.5), pw * 0.07, ph * 0.035, '#e8806a');
  oval(g, cx + pw * 0.19, at(0.5), pw * 0.07, ph * 0.035, '#e8806a');
  g.globalAlpha = 1;
  g.strokeStyle = '#16110e';
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    // 눈썹과 눈. 웃는 얼굴은 눈이 초승달처럼 휜다.
    g.lineWidth = pw * 0.035;
    g.beginPath();
    g.moveTo(cx + s * pw * 0.07, at(0.365) + (grin ? 0 : ph * 0.012));
    g.lineTo(cx + s * pw * 0.19, at(0.355));
    g.stroke();
    g.lineWidth = pw * 0.028;
    g.beginPath();
    if (grin) g.arc(cx + s * pw * 0.13, at(0.425), pw * 0.05, Math.PI * 1.15, Math.PI * 1.85);
    else g.arc(cx + s * pw * 0.13, at(0.41), pw * 0.012, 0, TAU);
    g.stroke();
  }
  // 코와 입
  g.strokeStyle = '#c99872';
  g.lineWidth = pw * 0.022;
  g.beginPath();
  g.arc(cx, at(0.47), pw * 0.035, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
  if (grin) {
    g.fillStyle = '#7a2a22';
    g.beginPath();
    g.arc(cx, at(0.53), pw * 0.12, 0, Math.PI);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(cx - pw * 0.095, at(0.53), pw * 0.19, ph * 0.022);
  } else {
    g.strokeStyle = '#7a2a22';
    g.lineWidth = pw * 0.028;
    g.beginPath();
    g.moveTo(cx - pw * 0.08, at(0.56));
    g.lineTo(cx + pw * 0.08, at(0.56));
    g.stroke();
  }
  g.restore();
}

/**
 * 탄광 갱도 벽에 원수님 초상화를 띄엄띄엄 건다. 달려오는 쪽에서 잘 보이도록 벽에서 비스듬히 틀어 건다.
 * @author heojeehaeng(claude)
 * @param {Put} put 소품 배치 함수
 */
function minePortraits(put: Put): void {
  const end = STAGES[0].to;
  // level.ts에서 표지판, 게시판, 벽 파는 동료를 세운 자리 [쪽, 거리]. 같은 쪽에 겹치면 맞은편 벽에 건다.
  const taken: [number, number][] = [[-1, 30], [1, 178], [-1, 225], [-1, 337.5], [-1, 465], [-1, 637.5], [1, end - 14]];
  const notes = ['원수님께서 지켜보신다', '오늘도 감사합니다', '웃으며 캡시다'];
  const frame = new THREE.Group();
  const pic = makePanel((g, w, h) => drawLeader(g, w, h, true), 1.25, 1.55);
  pic.position.y = 3.05;
  // 높이 건 액자처럼 위쪽이 앞으로 살짝 쏠리게 한다.
  pic.rotation.x = 0.12;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf0cf8a }));
  lamp.position.set(0, 4.02, 0.22);
  frame.add(pic, lamp, box(0.05, 0.05, 0.3, 0x111111, 0, 4.05, 0.08), box(1.45, 1.75, 0.06, 0x2a221e, 0, 3.05, -0.08));
  let side = 1;
  // 받침목 기둥(12.5m 간격)의 한가운데에 걸어 기둥에 가리지 않게 한다.
  for (let i = 0, d = 74.75; d < end - 20; i++, d += 75) {
    side = -side;
    const s = taken.some(([ts, td]) => ts === side && Math.abs(td - d) < 9) ? -side : side;
    const g = frame.clone();
    const note = makeSign(notes[i % notes.length], 1.5, 0.34, '#7a1f1f', '#ffe9a8', 0);
    note.position.y = 1.78;
    g.add(note);
    put(g, s * 4.38, d, s < 0 ? 0.95 : -0.95);
  }
}

/**
 * 시내 한복판에 원수님 광장을 만든다. 붉은 양탄자, 돌 깔린 바닥, 꽃술을 든 군중, 기둥이 늘어선 주석단 건물,
 * 글자를 만드는 배경대, 구호 띠를 단 풍선이 들어간다.
 * @author heojeehaeng(claude)
 * @param {Put} put 소품 배치 함수
 */
function citySquare(put: Put): void {
  const { from, to } = PLAZA;
  const stone = mat(0xe8e2e8);
  const carpet = mat(RED);
  const flatPlane = (w: number, len: number, m: THREE.Material, x: number, y: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, len), m);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, y, 0);
    p.receiveShadow = true;
    return p;
  };
  // 바닥과 군중은 배경 묶음 하나씩에 맞춰 나눠 깔아, 멀리서 한꺼번에 나타나거나 지나자마자 사라지지 않게 한다.
  for (let c = from, i = 0; c < to; c += CHUNK, i++) {
    const mid = c + CHUNK / 2;
    const floor = new THREE.Group();
    for (const s of [-1, 1]) floor.add(flatPlane(1.9, CHUNK, carpet, s * 5.25, -0.006), flatPlane(44, CHUNK, stone, s * 28.2, -0.012));
    noShadow(put(floor, 0, mid));
    noShadow(put(makeCrowd(-30, -9, c + 3, c + CHUNK - 3, mid, i % 2 ? 0xe23a4a : 0xf277a8, 31 + i), 0, mid));
    // 주석단 계단 앞은 비워 둔다.
    if (i !== 1) noShadow(put(makeCrowd(9, 25, c + 3, c + CHUNK - 3, mid, i % 2 ? 0xf277a8 : 0xe23a4a, 41 + i), 0, mid));
  }
  put(makeTribune(), 0, from + 75);
  // 광장 들머리의 현수막
  const gate = new THREE.Group();
  const banner = makeSign('원수님 광장\n(박수는 3분 이상)', 13.6, 2.5, RED_CSS, GOLD_CSS, 0);
  banner.position.y = 5.9;
  gate.add(banner, box(0.5, 8.6, 0.5, 0xd9d2c6, -6.9, 4.3, -0.1), box(0.5, 8.6, 0.5, 0xd9d2c6, 6.9, 4.3, -0.1));
  put(gate, 0, from + 2);
  // 광장 끝에서 달려오는 쪽을 보고 선 배경대. 사람들이 색판을 들어 글자를 만든다.
  const stand = new THREE.Group();
  const cards = makePanel(drawCards('행복'), 30, 13, '행복', 512);
  cards.rotation.x = -0.45;
  cards.position.set(0, 1 + 6.5 * Math.cos(0.45), -6.5 * Math.sin(0.45));
  stand.add(cards, box(30.6, 1, 1.2, 0xcfc7ba, 0, 0.5, 0));
  for (const px of [-14, -5, 5, 14]) stand.add(box(0.4, 12.4, 0.4, 0x8a8478, px, 6.2, -6.1));
  put(stand, -24, to - 4, 0.12);
  const spots: [number, number, number][] = [[-14, 25, 17], [-25, 70, 19], [-12, 112, 16], [15, 20, 18], [21, 128, 17], [-33, 138, 21]];
  spots.forEach(([x, off, y], i) => noShadow(put(makeBalloon(i % 2 ? 0x2a58b8 : 0xd8262f, ['만\n세', '행\n복', '박\n수'][i % 3], y), x, from + off, x < 0 ? 0.2 : -0.2)));
}

/**
 * 꽃술을 머리 위로 든 군중 한 무리를 만든다. 사람 수가 많으므로 몸, 머리, 꽃술을 각각 한 번에 그린다.
 * @author heojeehaeng(claude)
 * @param {number} x0 무리의 왼쪽 끝 x
 * @param {number} x1 무리의 오른쪽 끝 x
 * @param {number} d0 무리가 시작하는 거리(m)
 * @param {number} d1 무리가 끝나는 거리(m)
 * @param {number} mid 무리를 놓을 기준 거리(m)
 * @param {number} color 꽃술 색
 * @param {number} seed 줄을 흐트러뜨리는 난수 시드
 * @return {THREE.Group} 군중. 원점은 (0, mid)다
 */
function makeCrowd(x0: number, x1: number, d0: number, d1: number, mid: number, color: number, seed: number): THREE.Group {
  const rnd = rng(seed);
  const step = 1.3;
  const cols = Math.floor((x1 - x0) / step) + 1;
  const rows = Math.floor((d1 - d0) / step) + 1;
  const n = cols * rows;
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 1.35, 0.26), mat(0xf4f0ea), n);
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), mat(0xf1c9a5), n);
  const poms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 0), mat(color), n);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++, i++) {
      const x = x0 + k * step + (rnd() - 0.5) * 0.25;
      const z = -(d0 + r * step - mid) + (rnd() - 0.5) * 0.25;
      bodies.setMatrixAt(i, m.makeTranslation(x, 0.68, z));
      heads.setMatrixAt(i, m.makeTranslation(x, 1.55, z));
      poms.setMatrixAt(i, m.makeTranslation(x + (rnd() - 0.5) * 0.3, 2.0 + rnd() * 0.25, z));
    }
  }
  const g = new THREE.Group();
  for (const mesh of [bodies, heads, poms]) {
    mesh.computeBoundingSphere();
    g.add(mesh);
  }
  return g;
}

/**
 * 광장 오른쪽의 주석단 건물을 만든다. 기둥이 늘어선 돌 건물 가운데에 붉은 휘장을 치고 원수님 초상화 두 점을 건다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 주석단 건물. 원점은 길 한가운데이고, 건물은 길 오른쪽(+x)에서 길을 보고 선다
 */
function makeTribune(): THREE.Group {
  const g = new THREE.Group();
  const stone = 0xd9d2c6;
  const pale = 0xf0ebe0;
  const trim = 0xc4bba9;
  g.add(box(16, 1.4, 100, 0xcfc7ba, 42, 0.7, 0), box(13, 11, 100, stone, 42.5, 6.9, 0), box(14.2, 0.9, 101, trim, 42.3, 12.85, 0));
  g.add(box(15, 16, 34, 0xe2dbd0, 41.5, 9.4, 0), box(16.2, 1, 35.2, trim, 41.5, 17.9, 0), box(13, 2, 30, stone, 42, 19.4, 0));
  for (let z = -47; z <= 47.1; z += 4.7) {
    if (Math.abs(z) < 18.5) continue;
    g.add(box(0.9, 9.8, 0.9, pale, 35.2, 6.3, z), box(0.1, 6.4, 2.3, 0x6f7f96, 35.95, 6.6, z + 2.35));
  }
  // 양 날개에 드리운 붉은 휘장
  for (const z of [-40, -30.6, -21.2, 21.2, 30.6, 40]) g.add(box(0.12, 8.6, 2.6, RED, 35.75, 6.9, z + 2.35));
  // 가운데의 붉은 벽과 초상화, 구호
  g.add(box(0.2, 11, 28, RED, 33.9, 8.4, 0));
  [true, false].forEach((grin, i) => {
    const pic = makePanel((c, w, h) => drawLeader(c, w, h, grin), 4.6, 5.8);
    pic.rotation.y = -Math.PI / 2;
    pic.position.set(33.72, 8.6, i ? -3.6 : 3.6);
    g.add(pic);
  });
  const slogan = makeSign('원수님 만세', 15, 1.7, RED_CSS, GOLD_CSS, 0);
  slogan.rotation.y = -Math.PI / 2;
  slogan.position.set(33.72, 12.0, 0);
  g.add(slogan);
  // 주석단으로 오르는 계단과 양탄자
  g.add(box(6, 0.5, 26, 0xcfc7ba, 31, 0.25, 0), box(4, 1.0, 22, 0xcfc7ba, 32, 0.5, 0), box(6.1, 0.06, 5, RED, 31, 0.53, 0));
  // 지붕의 붉은 기
  for (const z of [-12, -4, 4, 12]) g.add(box(0.12, 5, 0.12, 0x9a9a9a, 36, 22.9, z), box(0.05, 1.6, 2.6, RED, 36, 24.5, z - 1.36));
  return g;
}

/**
 * 군중이 색판을 들어 글자를 만든 배경대 그림을 그리는 함수를 만든다.
 * @author heojeehaeng(claude)
 * @param {string} text 색판으로 만들 글자
 * @return {Function} 캔버스에 그림을 그리는 함수
 */
function drawCards(text: string): Draw {
  return (g, w, h) => {
    const cell = 8;
    const cols = Math.floor(w / cell);
    const rows = Math.floor(h / cell);
    // 글자를 작은 캔버스에 먼저 쓰고, 그 점 하나하나를 색판 한 장으로 옮긴다.
    const mask = document.createElement('canvas');
    mask.width = cols;
    mask.height = rows;
    const mg = mask.getContext('2d')!;
    mg.fillStyle = '#ffffff';
    mg.font = `${Math.floor(rows * 0.82)}px ${FONT_DISPLAY}`;
    mg.textAlign = 'center';
    mg.textBaseline = 'middle';
    mg.fillText(text, cols / 2, rows * 0.54);
    const px = mg.getImageData(0, 0, cols, rows).data;
    g.fillStyle = '#9c2f52';
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const on = px[(r * cols + c) * 4 + 3] > 110;
        const edge = r < 2 || r >= rows - 2 || c < 2 || c >= cols - 2;
        g.fillStyle = on ? '#ffd92e' : edge ? '#d8262f' : (r * 7 + c * 3) % 5 === 0 ? '#e85a8c' : '#f277a8';
        g.beginPath();
        g.arc(c * cell + cell / 2, r * cell + cell / 2, cell * 0.44, 0, TAU);
        g.fill();
      }
    }
  };
}

/**
 * 구호 띠를 매단 큰 풍선을 만든다.
 * @author heojeehaeng(claude)
 * @param {number} color 풍선 색
 * @param {string} text 띠에 세로로 쓸 글. 글자마다 줄을 바꿔 넘긴다
 * @param {number} y 풍선이 떠 있는 높이(m)
 * @return {THREE.Group} 풍선. 띠의 글자는 +z 방향을 향한다
 */
function makeBalloon(color: number, text: string, y: number): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 10), mat(color));
  ball.position.y = y;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.5, 14, 1, true), mat(0xf4f0ea));
  band.position.y = y;
  const strip = makeSign(text, 1.5, 5.2, RED_CSS, GOLD_CSS, 0);
  strip.position.y = y - 7.4;
  g.add(ball, band, strip, box(0.04, y - 7.4, 0.04, 0x444444, 0, (y - 7.4) / 2, 0), box(0.04, 0.7, 0.04, 0x444444, 0, y - 1.9, 0));
  return g;
}

/**
 * 시내가 끝나는 자리에 길을 가로질러 작별 표지판을 세운다.
 * @author heojeehaeng(claude)
 * @param {Put} put 소품 배치 함수
 */
function farewellSign(put: Put): void {
  const g = new THREE.Group();
  const board = makeSign('안녕히 가시라우.\n- 조선인민공화국', 10.6, 2.7, '#1f5fa8', '#ffffff', 0);
  board.position.y = 4.9;
  g.add(board, box(11.6, 0.3, 0.3, 0x8a8f94, 0, 4.75, -0.12));
  for (const s of [-1, 1]) g.add(box(0.4, 7.6, 0.4, 0x8a8f94, s * 5.7, 3.8, -0.12));
  put(g, 0, STAGES[1].to - 12);
}

let peakMat: THREE.MeshLambertMaterial | null = null;

/**
 * 산봉우리 하나를 만든다. 뿔 모양의 꼭짓점들을 흐트러뜨려 울퉁불퉁하게 하고, 아래는 숲의 짙은 초록, 위는 바위의 잿빛으로 칠한다.
 * @author heojeehaeng(claude)
 * @param {Function} rnd 난수 함수
 * @param {number} r 밑면 반지름(m)
 * @param {number} h 높이(m)
 * @return {THREE.Mesh} 산봉우리. 원점은 밑면의 가운데다
 */
function makePeak(rnd: () => number, r: number, h: number): THREE.Mesh {
  const segs = 11;
  const rings = 4;
  const geo = new THREE.ConeGeometry(r, h, segs, rings, true);
  geo.translate(0, h / 2, 0);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  // 이음매에서 같은 자리에 겹친 꼭짓점이 벌어지지 않도록, 흐트러뜨리는 값은 고리와 칸마다 하나씩만 정한다.
  const bump: number[][] = [];
  for (let ring = 0; ring <= rings; ring++) bump.push(Array.from({ length: segs }, () => rnd()));
  const forest = new THREE.Color(0x435c4c);
  const rock = new THREE.Color(0x98a0a2);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / (segs + 1));
    const k = bump[ring][(i % (segs + 1)) % segs];
    const t = pos.getY(i) / h;
    if (ring === 0) {
      // 꼭대기는 한 점으로 모이므로 다 같이 옮겨 봉우리가 한쪽으로 기울게 한다.
      pos.setX(i, (bump[0][0] - 0.5) * r * 0.22);
      pos.setZ(i, (bump[0][1] - 0.5) * r * 0.22);
    } else {
      const s = 0.8 + k * 0.4;
      pos.setX(i, pos.getX(i) * s);
      pos.setZ(i, pos.getZ(i) * s);
      if (ring < rings) pos.setY(i, pos.getY(i) + (k - 0.5) * h * 0.12);
    }
    c.copy(forest).lerp(rock, Math.max(0, Math.min(1, (t - 0.55) / 0.4)));
    c.multiplyScalar(0.86 + k * 0.28);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  peakMat ??= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return new THREE.Mesh(geo, peakMat);
}

/**
 * 국경과 DMZ의 길 양옆 멀리에 큰 산줄기를 두 겹으로 세운다. 앞에는 낮은 산자락, 뒤에는 높은 봉우리를 이어 골짜기 길을 달리는 느낌을 낸다.
 * @author heojeehaeng(claude)
 * @param {Put} put 소품 배치 함수
 */
function dmzMountains(put: Put): void {
  const rnd = rng(23);
  const { from, to } = STAGES[2];
  for (const side of [-1, 1]) {
    for (let d = from + 20 + rnd() * 20; d < to - 10; d += 48 + rnd() * 18) {
      const r = 50 + rnd() * 10;
      noShadow(put(makePeak(rnd, r, 48 + rnd() * 34), side * (r + 50 + rnd() * 14), d, rnd() * TAU));
    }
    // 숲이 끝나는 자리(45m)부터 오르막이 시작되도록 산자락을 숲 바로 뒤에 붙인다.
    for (let d = from + 12 + rnd() * 20; d < to - 10; d += 30 + rnd() * 14) {
      const r = 19 + rnd() * 6;
      noShadow(put(makePeak(rnd, r, 12 + rnd() * 11), side * (r + 44 + rnd() * 8), d, rnd() * TAU));
    }
  }
}

const camoMats = new Map<string, THREE.MeshLambertMaterial>();
let camoCanvas: HTMLCanvasElement | null = null;

/**
 * 건물 벽에 칠한 얼룩 위장 무늬 재질을 반환한다. 무늬 그림 한 장을 함께 쓰고, 벽 크기에 맞춰 되풀이 횟수만 달리한다.
 * @author heojeehaeng(claude)
 * @param {number} ru 가로로 되풀이하는 횟수
 * @param {number} rv 세로로 되풀이하는 횟수
 * @return {THREE.MeshLambertMaterial} 위장 무늬 재질
 */
function camoWall(ru: number, rv: number): THREE.MeshLambertMaterial {
  const key = `${ru}x${rv}`;
  let m = camoMats.get(key);
  if (m) return m;
  if (!camoCanvas) {
    camoCanvas = document.createElement('canvas');
    camoCanvas.width = 256;
    camoCanvas.height = 128;
    const g = camoCanvas.getContext('2d')!;
    const rnd = rng(77);
    g.fillStyle = '#5f6b45';
    g.fillRect(0, 0, 256, 128);
    for (const color of ['#3f4a30', '#8a7150', '#c7b88c', '#3f4a30', '#8a7150', '#2e3328']) {
      for (let i = 0; i < 6; i++) {
        const bx = rnd() * 256;
        const by = rnd() * 128;
        for (let k = 0; k < 6; k++) {
          const x = bx + (rnd() - 0.5) * 46;
          const y = by + (rnd() - 0.5) * 26;
          const r = 8 + rnd() * 13;
          // 그림 가장자리에 걸친 얼룩은 반대편에도 그려, 되풀이해 붙여도 이음매가 보이지 않게 한다.
          for (const ox of [-256, 0, 256]) for (const oy of [-128, 0, 128]) oval(g, x + ox, y + oy, r * 1.3, r, color);
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(camoCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ru, rv);
  m = new THREE.MeshLambertMaterial({ map: tex });
  camoMats.set(key, m);
  return m;
}

/**
 * 위장 무늬를 칠한 창고를 만든다. 낮고 긴 건물에 잿빛 골함석 맞배지붕을 얹고 지붕마루에 파란 환기통을 단다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 창고. 정면은 +z 방향이다
 */
function makeStore(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(22, 4.2, 8), camoWall(2.6, 1));
  body.position.y = 2.1;
  g.add(body);
  for (const px of [-10.9, -3.7, 3.7, 10.9]) g.add(box(0.5, 4.2, 0.3, 0x3f4f36, px, 2.1, 4.02));
  g.add(box(4.6, 3.3, 0.16, 0x4a5a3c, 0, 1.65, 4.04), box(0.08, 3.3, 0.2, 0x2c3526, 0, 1.65, 4.05));
  // 세모 기둥을 눕혀 맞배지붕으로 쓴다. 한 꼭짓점이 위로 오게 돌린 뒤 폭과 높이를 맞춘다.
  const prism = new THREE.CylinderGeometry(1, 1, 23.4, 3);
  prism.rotateZ(Math.PI / 2);
  prism.rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(prism, mat(0xb4b8ba));
  roof.scale.set(1, 1.13, 5.4);
  roof.position.y = 4.2 + 0.5 * 1.13;
  g.add(roof);
  for (const px of [-6.2, 6.2]) {
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.7, 10), mat(0x3f79c9));
    vent.position.set(px, 6.15, 0);
    g.add(vent);
  }
  const plate = makeSign('보급 창고', 2.2, 0.55, '#f4f0e6', '#222222', 0);
  plate.position.set(-7.3, 3.2, 4.12);
  g.add(plate);
  return g;
}

/**
 * 흙을 덮은 탄약고를 만든다. 위장 무늬를 칠한 사다리꼴 앞벽에 철문과 차양, 번호판을 달고 뒤로 풀 덮인 둔덕을 쌓는다.
 * @author heojeehaeng(claude)
 * @return {THREE.Group} 탄약고. 정면은 +z 방향이다
 */
function makeBunker(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-8, 0);
  shape.lineTo(8, 0);
  shape.lineTo(4.8, 4.8);
  shape.lineTo(-4.8, 4.8);
  shape.closePath();
  // 밀어낸 도형은 무늬 좌표가 미터 단위로 잡히므로, 벽 한 면에 무늬가 두 번쯤 들어가게 되풀이 횟수를 작게 준다.
  const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false }), camoWall(0.12, 0.2));
  // 뒤의 둔덕은 반구를 납작하게 눌러 만든다. 앞벽을 뚫고 나오지 않게 벽 바로 뒤에서 끝낸다.
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2), mat(0x6d8454));
  mound.scale.set(9, 5.1, 7.4);
  mound.position.z = -7.5;
  g.add(wall, mound);
  const door = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, 0.2), camoWall(0.7, 0.8));
  door.position.set(0, 1.75, 0.95);
  g.add(door, box(0.08, 3.5, 0.24, 0x2c3526, 0, 1.75, 0.96), box(6.6, 0.7, 1.7, 0x4b5236, 0, 3.95, 1.45));
  const plate = makeSign('306', 1.1, 0.5, '#e9d24a', '#222222', 0);
  plate.position.set(0, 3.7, 2.32);
  const warn = makeSign('탄약고\n화기 엄금', 1.5, 0.9, '#ffffff', '#b3261e', 1.1);
  warn.position.set(5.8, 0, 2.6);
  g.add(plate, warn, box(0.08, 3.2, 0.08, 0x444444, 0.9, 6.4, -2.2));
  return g;
}



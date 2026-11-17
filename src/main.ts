import * as THREE from 'three';
import { CHECKPOINTS, COURSE_LEN, stageAt } from './config';
import { BUBBLE_TEXT, Ctx, Entity } from './entities';
import { Fx } from './fx';
import { Input } from './input';
import { buildDecor, buildEntities, Decor } from './level';
import { Player } from './player';
import { Outline } from './post';
import { loadProps } from './props';
import { Hud, pickTitle, RunResult, saveRecord, shareCard, showFail, showRanking, showResult, validateNick } from './ui';
import { World } from './world';

/** 부스터를 쓸 때 리용길이 외치는 대사 */
const BOOST_LINES = ['이야호!', '니용앤비용~', '너에게로 달려가는 중\n람보르기니보다 빨리 슝', '분석 중~!?', '난 널 버리지 않아~♪'];
/** 슬라이드를 시작할 때 리용길이 외치는 대사 */
const SLIDE_LINE = '쏙~!';
/** 기어가기를 시작할 때 리용길이 외치는 대사 */
const CRAWL_LINES = ['엉금엉금 기어서 가자~♪', '각! 개! 전! 투!'];

/** 문 앞 이 거리에서 멈춰 노크한다 */
const KNOCK_AT = COURSE_LEN - 2.5;

class Game implements Ctx {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.9);
  private sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private fog = new THREE.Fog(0x000000, 10, 100);
  private world: World;
  private decor: Decor;
  private entities: Entity[];
  private input: Input;
  private hud = new Hud();
  private shadow: THREE.Mesh;
  private state: 'menu' | 'play' | 'knock' | 'result' | 'dead' = 'menu';
  private last = performance.now();
  private runMs = 0;
  private checkpoint = 0;
  private detections = 0;
  private animalHits = 0;
  private shakeT = 0;
  private knockT = 0;
  private knockStep = 0;
  private stageId = '';
  private nick = '';
  private hints = new Set<string>();
  /** 이번 프레임에 발각되었으면 사유 문구가 들어 있다. 적 갱신이 끝난 뒤 처리한다 */
  private arrestMsg: string | null = null;
  private fov = 62;
  private fx: Fx;
  private skyCanvas = document.createElement('canvas');
  private skyTex: THREE.CanvasTexture;
  private skyKey = '';
  private wasFallen = false;
  private result: RunResult | null = null;
  private seenBoosts = 0;
  private shoutT = -10;
  private lastLine = -1;
  private crawlLine = Math.floor(Math.random() * CRAWL_LINES.length);
  private wasCrawling = false;
  private seenSlides = 0;
  /** 마지막으로 띄운 대사가 슬라이드 대사인지 여부 */
  private slideSaid = false;
  /** 슬라이드 연출의 세기(0~1). 카메라가 낮아지는 정도를 부드럽게 잇는다 */
  private slideK = 0;
  private outline: Outline | null = null;

  player = new Player();
  time = 0;
  inCrowd = false;

  /**
   * 장면, 코스, 입력, 화면 버튼을 준비하고 게임 루프를 시작한다.
   * @author heojeehaeng(claude)
   */
  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.fog = this.fog;
    this.sun.position.set(5, 9, 7);
    // 해가 리용길 주변에만 그림자를 드리우게 한다. 터치 기기에서는 그림자 해상도를 낮춰 부담을 줄인다.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = coarse ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 34;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.player.group);
    // 외곽선 후처리는 깊이 그림을 읽어야 해서 WebGL2에서만 켠다.
    if (this.renderer.capabilities.isWebGL2) this.outline = new Outline(this.renderer, this.camera);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
    this.skyCanvas.width = 2;
    this.skyCanvas.height = 128;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTex;
    this.fx = new Fx(this.scene);
    this.world = new World(this.scene);
    this.decor = buildDecor(this);
    this.entities = buildEntities(this, Game.newSeed());
    this.input = new Input(canvas);
    this.bindUi();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame(() => this.loop());
  }

  /**
   * 발각된 플레이어를 곧바로 붙잡는다. 다시 출발한 직후의 무적 시간에는 무시한다.
   * @author heojeehaeng(claude)
   * @param {string} msg 발각 사유 문구
   */
  detect(msg: string): void {
    if (this.state !== 'play' || this.player.invulnT > 0) return;
    this.arrestMsg = msg;
  }

  /**
   * 탈북 실패로 판을 끝내고 실패 화면을 띄운다.
   * @author heojeehaeng(claude)
   * @param {string} reason 실패 사유 문구
   */
  kill(reason: string): void {
    if (this.state !== 'play') return;
    this.state = 'dead';
    this.input.enabled = false;
    this.hud.show(false);
    this.shake(0.8);
    showFail(reason);
  }

  say(text: string): void {
    this.hud.say(text);
  }

  hintOnce(text: string): void {
    if (this.hints.has(text)) return;
    this.hints.add(text);
    this.toast(text, 2.6);
  }

  /**
   * 적 배치에 쓸 시드를 새로 만든다.
   * @author heojeehaeng(claude)
   * @return {number} 무작위 시드
   */
  private static newSeed(): number {
    return Math.floor(Math.random() * 1e9);
  }

  toast(msg: string, sec?: number): void {
    this.hud.toast(msg, sec);
  }

  shake(power: number): void {
    this.shakeT = Math.max(this.shakeT, power);
  }

  add(obj: THREE.Object3D, d: number, always?: boolean): void {
    this.world.addEntity(obj, d, always);
  }

  addProp(obj: THREE.Object3D, d: number): void {
    this.world.add(obj, d);
  }

  animalHit(): void {
    this.animalHits++;
  }

  /**
   * 시작, 랭킹, 공유, 다시 하기 버튼에 동작을 연결한다.
   * @author heojeehaeng(claude)
   */
  private bindUi(): void {
    const $ = (id: string) => document.getElementById(id)!;
    const nickEl = $('nick') as HTMLInputElement;
    const start = () => {
      const nick = nickEl.value.trim();
      const err = validateNick(nick);
      $('nick-error').textContent = err ?? '';
      if (err) return;
      nickEl.blur();
      this.start(nick);
    };
    $('btn-start').addEventListener('click', start);
    nickEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') start();
    });
    $('btn-rank').addEventListener('click', () => showRanking(false));
    $('btn-rank2').addEventListener('click', () => showRanking(false));
    $('tab-all').addEventListener('click', () => showRanking(false));
    $('tab-today').addEventListener('click', () => showRanking(true));
    $('btn-rank-close').addEventListener('click', () => $('rank').classList.add('hidden'));
    $('btn-share').addEventListener('click', () => this.result && shareCard(this.result, false));
    $('btn-save').addEventListener('click', () => this.result && shareCard(this.result, true));
    // 다시 할 때도 닉네임을 새로 입력하도록 처음 화면으로 돌아간다.
    $('btn-retry').addEventListener('click', () => location.reload());
    $('btn-fail-retry').addEventListener('click', () => location.reload());
  }

  /**
   * 닉네임을 받아 달리기를 시작한다.
   * @author heojeehaeng(claude)
   * @param {string} nick 닉네임
   */
  private start(nick: string): void {
    this.nick = nick;
    document.getElementById('menu')!.classList.add('hidden');
    this.hud.show(true);
    this.player.respawn(0, 0);
    this.runMs = 0;
    this.state = 'play';
    this.input.clear();
    this.input.enabled = true;
    this.hud.shout('카리나 동무 기다리라우!!', 2400);
    // 출발 대사가 바로 덮이지 않도록 부스터 대사는 조금 뒤부터 받는다.
    this.shoutT = this.time + 1.2;
    this.slideSaid = false;
  }

  /**
   * 부스터를 쓸 때 외칠 대사를 무작위로 고른다. 같은 대사가 연달아 나오지 않게 한다.
   * @author heojeehaeng(claude)
   * @return {string} 대사
   */
  private pickBoostLine(): string {
    let i = Math.floor(Math.random() * BOOST_LINES.length);
    if (i === this.lastLine) i = (i + 1) % BOOST_LINES.length;
    this.lastLine = i;
    return BOOST_LINES[i];
  }

  /**
   * 탄광 앞부분에서 지금 익힐 조작을 고른다. 연습용 장애물 앞에서 그 조작을 강조한다.
   * @author heojeehaeng(claude)
   * @param {number} d 달린 거리(m)
   * @return {string|null} 강조할 동작. 없으면 null
   */
  private static keyFocus(d: number): string | null {
    if (d < 45) return 'move';
    if (d < 110) return 'jump';
    if (d > 125 && d < 195) return 'slide';
    if (d >= 195 && d < 270) return 'boost';
    return null;
  }

  /**
   * 하늘을 위에서 지평선까지 이어지는 그라데이션으로 칠한다. 색이 바뀌었을 때만 다시 그린다.
   * @author heojeehaeng(claude)
   * @param {THREE.Color} top 하늘 꼭대기 색
   * @param {THREE.Color} horizon 지평선 색
   */
  private paintSky(top: THREE.Color, horizon: THREE.Color): void {
    const key = `${top.getHexString()}-${horizon.getHexString()}`;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const g = this.skyCanvas.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, `#${top.getHexString()}`);
    // 화면 가운데 조금 위가 지평선이므로 그 아래는 지평선 색으로 채운다.
    grad.addColorStop(0.5, `#${horizon.getHexString()}`);
    grad.addColorStop(1, `#${horizon.getHexString()}`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 128);
    this.skyTex.needsUpdate = true;
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.outline?.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    // 세로 화면에서는 좌우가 좁아 보이지 않도록 시야각을 넓힌다.
    this.fov = w < h ? 80 : 62;
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  private loop(): void {
    const now = performance.now();
    // 탭 전환 등으로 프레임이 길어져도 장애물을 건너뛰지 않도록 시간을 제한한다.
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (this.state === 'play') this.updatePlay(dt);
    else if (this.state === 'knock') this.updateKnock(dt);
    this.render(dt);
    requestAnimationFrame(() => this.loop());
  }

  /**
   * 달리는 동안의 한 프레임을 처리한다. 이동, 적 갱신, 발각, 체크포인트, 도착을 판정한다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   */
  private updatePlay(dt: number): void {
    const p = this.player;
    this.runMs += dt * 1000;
    p.update(dt, this.input);
    if (p.boosts !== this.seenBoosts) {
      this.seenBoosts = p.boosts;
      // 부스터는 연달아 쓸 수 있으므로 대사는 앞의 것이 읽힐 만큼 지난 뒤에만 바꾼다.
      if (this.time - this.shoutT > 1.2) {
        this.shoutT = this.time;
        this.slideSaid = false;
        this.hud.shout(this.pickBoostLine(), 1500, p.hits);
      }
    }
    if (p.slides !== this.seenSlides) {
      this.seenSlides = p.slides;
      this.fx.burst(p.x, -p.d + 0.4, stageAt(p.d).road, 6);
      if (this.time - this.shoutT > 1.2) {
        this.shoutT = this.time;
        this.slideSaid = true;
        this.hud.shout(SLIDE_LINE, 900, p.hits);
      }
    }
    // 기어가기를 시작하는 순간에 한 번 외친다. 두 대사를 번갈아 쓰고, 짧게 끊어 눌러도 대사가 쏟아지지 않게 간격을 둔다.
    // 아래 방향키는 누르는 순간 슬라이드가 먼저 나가므로, 슬라이드 대사가 떠 있을 때는 기다리지 않고 바꾼다.
    if (p.hiding && !this.wasCrawling && (this.slideSaid || this.time - this.shoutT > 1.2)) {
      this.shoutT = this.time;
      this.slideSaid = false;
      this.crawlLine = (this.crawlLine + 1) % CRAWL_LINES.length;
      this.hud.shout(CRAWL_LINES[this.crawlLine], 1500, p.hits);
    }
    this.wasCrawling = p.hiding;
    this.inCrowd = false;
    for (const e of this.entities) {
      const dd = e.d - p.d;
      if (e.always || (dd < 210 && dd > -40)) e.update(dt, this);
      // 발각되었거나 판이 끝났으면 남은 적은 이번 프레임에 갱신하지 않는다.
      if (this.arrestMsg || this.state !== 'play') break;
    }
    if (this.state !== 'play') return;
    if (this.arrestMsg) {
      this.arrest(this.arrestMsg);
      this.arrestMsg = null;
    }
    for (const cp of CHECKPOINTS) if (p.d >= cp && cp > this.checkpoint) this.checkpoint = cp;
    const stage = stageAt(p.d);
    if (stage.id !== this.stageId) {
      this.stageId = stage.id;
      if (p.d > 1) this.toast(stage.name, 2);
    }
    // 조작 안내판은 조작을 익히는 탄광 구간에서만 보여 준다.
    this.hud.keys(stage.id === 'mine', Game.keyFocus(p.d));
    if (p.d >= KNOCK_AT) {
      p.d = KNOCK_AT;
      p.x = 0;
      p.state = 'stop';
      p.update(0, this.input);
      this.input.enabled = false;
      this.state = 'knock';
      this.knockT = 0;
    }
  }

  /**
   * 발각되어 붙잡힌 플레이어를 직전 체크포인트로 돌려보내고, 적과 장애물을 새로 배치한다.
   * 시계는 멈추지 않는다.
   * @author heojeehaeng(claude)
   * @param {string} msg 발각 사유 문구
   */
  private arrest(msg: string): void {
    this.detections++;
    this.player.hits++;
    this.player.respawn(this.checkpoint, 1.5);
    this.world.clearEntities();
    this.entities = buildEntities(this, Game.newSeed());
    this.toast(`${msg} 체크포인트에서 다시 출발`, 2.0);
    this.shake(0.4);
  }

  /**
   * 생활관 문을 두드리고 문이 열리는 결승 연출을 진행한 뒤 결과를 보여 준다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   */
  private updateKnock(dt: number): void {
    this.knockT += dt;
    const steps: [number, () => void][] = [
      [0.3, () => this.toast('똑')],
      [0.8, () => this.toast('똑, 똑')],
      [1.3, () => this.toast('똑, 똑, 똑')],
      [2.2, () => {
        this.decor.greeter.visible = true;
        this.decor.greeter.position.z = -COURSE_LEN + 0.7;
        this.toast('"이라시야마쎼이!!!!!!!!"', 1.7);
      }],
      [4.0, () => this.toast('간부: "CCTV로 발견한 걸로 하자"', 2)],
      [6.0, () => this.finish()],
    ];
    while (this.knockStep < steps.length && this.knockT >= steps[this.knockStep][0]) steps[this.knockStep++][1]();
    if (this.knockT > 2.0) {
      const door = this.decor.door;
      door.rotation.y += (-1.5 - door.rotation.y) * Math.min(1, dt * 6);
    }
  }

  /**
   * 기록을 저장하고 결과 화면을 띄운다.
   * @author heojeehaeng(claude)
   */
  private finish(): void {
    this.state = 'result';
    this.hud.show(false);
    const { rank, total } = saveRecord(this.nick, this.runMs);
    const p = this.player;
    this.result = {
      nick: this.nick,
      timeMs: this.runMs,
      falls: p.falls,
      detections: this.detections,
      animalHits: this.animalHits,
      rank,
      total,
      title: pickTitle(this.runMs, p.falls, this.detections, this.animalHits),
    };
    showResult(this.result);
  }

  /**
   * 배경색과 조명, 카메라를 플레이어 위치에 맞춘 뒤 장면을 그린다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   */
  private render(dt: number): void {
    const p = this.player;
    this.world.update(p.d);
    const env = this.world.envAt(p.d);
    this.paintSky(env.top, env.sky);
    this.fog.color.copy(env.sky);
    this.fog.near = env.fogNear;
    this.fog.far = env.fogFar;
    this.hemi.intensity = 1.9 * env.light;
    this.sun.intensity = 2.2 * env.light;
    this.shadow.position.set(p.x, 0.03, -p.d);
    // 높이 뛸수록 그림자를 작고 옅게 그린다.
    this.shadow.scale.setScalar(Math.max(0.45, 1 - p.y * 0.18));

    const dust = stageAt(p.d).road;
    if (this.state === 'play' && p.state === 'run' && p.y === 0) this.fx.trail(dt, p.x, -p.d, p.speed, dust);
    const sliding = this.state === 'play' && p.sliding;
    if (sliding) this.fx.spray(dt, p.x, -p.d, dust);
    this.slideK += ((sliding ? 1 : 0) - this.slideK) * Math.min(1, dt * 10);
    const fallen = p.state === 'fall';
    if (fallen && !this.wasFallen) this.fx.burst(p.x, -p.d, dust);
    this.wasFallen = fallen;
    this.fx.update(dt);

    this.shakeT = Math.max(0, this.shakeT - dt);
    const sx = (Math.random() - 0.5) * this.shakeT;
    const sy = (Math.random() - 0.5) * this.shakeT;
    const close = this.state === 'knock' || this.state === 'result';
    // 결승 연출에서는 문을 여는 병사가 리용길에 가리지 않도록 카메라를 옆으로 옮긴다.
    const cx = close ? 1.7 : p.x * 0.55;
    const back = close ? 4.2 : 7.2;
    // 슬라이드하는 동안에는 카메라가 바닥 가까이 내려와 바짝 따라붙어, 땅을 스치는 속도감을 준다.
    const k = close ? 0 : this.slideK;
    this.camera.position.set(cx + sx, (close ? 2.6 : 3.8 - k * 0.8) + sy, -p.d + back - k * 1.2);
    this.camera.lookAt(close ? 0.3 : cx, close ? 1.4 : 1.0 - k * 0.2, -p.d - (close ? 7 : 10));
    // 부스터를 쓰는 동안에는 시야각을 크게, 슬라이드하는 동안에는 조금 넓혀 속도감을 준다.
    const wantFov = (window.innerWidth < window.innerHeight ? 80 : 62) + (p.boostT > 0 ? 16 : k * 6);
    if (Math.abs(wantFov - this.fov) > 0.1) {
      this.fov += (wantFov - this.fov) * Math.min(1, dt * 10);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    // 그림자 범위가 리용길을 따라가게 한다. 1m 단위로만 옮겨 그림자 가장자리가 떨리는 것을 줄인다.
    const sz = -Math.round(p.d) - 16;
    this.sun.target.position.set(0, 0, sz);
    this.sun.position.set(12, 22, sz + 16);
    if (this.outline) this.outline.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);

    this.hud.rush(this.state === 'play' && p.boosting);
    this.hud.skid(sliding && !p.boosting);

    if (this.state === 'play' || this.state === 'knock') {
      this.hud.update(this.runMs, p.d / COURSE_LEN, stageAt(p.d).name);
    }
  }
}

// 배경 모델을 먼저 받아야 코스를 만들 수 있으므로, 그동안 시작 단추를 잠가 둔다.
const startBtn = document.getElementById('btn-start') as HTMLButtonElement;
startBtn.disabled = true;
startBtn.textContent = '불러오는 중…';
// 말풍선은 캔버스에 한 번 그려 두므로, 그리기 전에 웹 글꼴을 받아 둔다. 인터넷이 안 되면 2.5초 뒤 기본 글꼴로 넘어간다.
const fonts = Promise.race([
  document.fonts.load('40px Jua', BUBBLE_TEXT),
  new Promise((resolve) => window.setTimeout(resolve, 2500)),
]).catch(() => undefined);
const models = loadProps((done, total) => {
  startBtn.textContent = `불러오는 중… ${Math.round((done / total) * 100)}%`;
});
Promise.all([models, fonts]).then(() => {
  const game = new Game();
  startBtn.disabled = false;
  startBtn.textContent = '탈북 시작';
  // 개발 서버에서만 콘솔로 상태를 들여다볼 수 있게 한다.
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __game: Game }).__game = game;
});

import * as THREE from 'three';
import { CHECKPOINTS, COURSE_LEN, FONT, stageAt } from './config';
import { BUBBLE_TEXT, Ctx, Entity } from './entities';
import { Fx } from './fx';
import { Ghost, PEER_COLORS, POSE } from './ghost';
import { Input } from './input';
import { buildDecor, buildEntities, Decor } from './level';
import { Player } from './player';
import { PARTY_FROM } from './party';
import { submitOnline } from './rank';
import { Outline } from './post';
import { loadProps } from './props';
import { EnterMode, PosMsg, Room, ROOM_BUDGET, ROOM_MAX } from './room';
import {
  fillLobby, fillVersus, fmtTime, Hud, lobbyFind, pickTitle, RunResult, saveRecord, shareCard, showFail, showLobby, showRanking, showResult,
  validateNick, VersusRow,
} from './ui';
import { World } from './world';

/** 부스터를 쓸 때 리용길이 외치는 대사 */
const BOOST_LINES = ['이야호!', '니용앤비용~', '너에게로 달려가는 중\n람보르기니보다 빨리 슝', '분석 중~!?', '난 널 버리지 않아~♪'];
/** 슬라이드를 시작할 때 리용길이 외치는 대사 */
const SLIDE_LINE = '쏙~!';
/** 기어가기를 시작할 때 리용길이 외치는 대사 */
const CRAWL_LINES = ['엉금엉금 기어서 가자~♪', '각! 개! 전! 투!'];

/** 문 앞 이 거리에서 멈춰 노크한다 */
const KNOCK_AT = COURSE_LEN - 2.5;

/** 방으로 돌아갈 때 이름을 다시 묻지 않도록 이 탭에만 잠깐 적어 두는 자리 */
const BACK_KEY = 'talbook.room.back';
/** 방에 들어가지 못했을 때 보여 주는 문구 */
const ROOM_ERRORS: Record<string, string> = {
  empty: '그런 방이 없습니다. 방 번호를 확인해 주세요.',
  full: '방이 가득 찼습니다. (최대 4명)',
  taken: '방을 만들지 못했습니다. 다시 눌러 주세요.',
};

/** 함께 달리는 다른 사람의 이번 경주 상태. left는 달리다가 나간 경우다 */
interface Rival {
  nick: string;
  color: number;
  phase: 'race' | 'done' | 'out' | 'left';
  timeMs: number;
}

/**
 * 옷 색을 CSS 색 문자열로 바꾼다.
 * @author heojeehaeng(claude)
 * @param {number} color 16진수 색상
 * @return {string} CSS 색 문자열
 */
function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * 색을 조금 어둡게 만든다. 모자 띠처럼 같은 계열의 짙은 색이 필요할 때 쓴다.
 * @author heojeehaeng(claude)
 * @param {number} color 원래 색
 * @return {number} 어두워진 색
 */
function shade(color: number): number {
  const ch = (shift: number) => Math.round(((color >> shift) & 255) * 0.8) << shift;
  return ch(16) | ch(8) | ch(0);
}

/**
 * 지금 주소에서 방 번호만 바꾼 주소를 만든다. 다른 설정(?online)은 그대로 둔다.
 * @author heojeehaeng(claude)
 * @param {string|null} room 방 번호. null이면 방 번호를 뺀다
 * @return {string} 주소
 */
function pageUrl(room: string | null): string {
  const q = new URLSearchParams(location.search);
  if (room) q.set('room', room);
  else q.delete('room');
  const s = q.toString().replace(/=(?=&|$)/g, '');
  return location.origin + location.pathname + (s ? `?${s}` : '');
}

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
  /** ready는 멀티 플레이에서 출발선에 서서 셋을 세는 동안이다 */
  private state: 'menu' | 'ready' | 'play' | 'knock' | 'result' | 'dead' = 'menu';
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
  /** 이번 프레임에 시야나 빛에 닿았으면 사유 문구가 들어 있다. 적 갱신이 끝난 뒤 처리한다 */
  private arrestMsg: string | null = null;
  /** 이번 프레임에 닿은 것이 봐주는 시간(초). 여럿에 닿았으면 가장 짧은 값이다 */
  private arrestGrace = 0;
  /** 시야나 빛에 끊기지 않고 닿아 있은 시간(초) */
  private seenT = 0;
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
  /** 결승 축하 장면으로 카메라가 넓게 물러난 정도(0~1) */
  private partyK = 0;
  private outline: Outline | null = null;
  /** 들어가 있는 멀티 플레이 방. 혼자 할 때는 null이다 */
  private room: Room | null = null;
  /** 초대 링크로 들어와, 이름을 넣으면 바로 들어갈 방 번호 */
  private invite = '';
  /** 이번 경주에서 모두가 함께 쓰는 배치 시드 */
  private seed = 0;
  /** 이번 경주에 함께 출발한 사람들의 식별자. 순서가 곧 색과 출발 자리다 */
  private crew: string[] = [];
  /** 나를 뺀 참가자들의 이번 경주 상태 */
  private rivals = new Map<string, Rival>();
  /** 달리고 있는 다른 사람들의 모습 */
  private ghosts = new Map<string, Ghost>();
  /** 출발선에서 셋을 세기 시작한 뒤 흐른 시간(초) */
  private countT = 0;
  private countStep = 0;
  /** 다음 위치 소식을 보낼 때까지 남은 시간(초) */
  private sendT = 0;
  /** 마지막으로 위치 소식을 보낸 뒤 흐른 시간(초) */
  private sentAgo = 0;
  private sentFlags = 0;

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
   * 이번 프레임에 플레이어가 시야나 빛에 닿았음을 알린다. 봐주는 시간 넘게 계속 닿아 있으면 붙잡는다.
   * 다시 출발한 직후의 무적 시간에는 무시한다.
   * @author heojeehaeng(claude)
   * @param {string} msg 발각 사유 문구
   * @param {number} grace 봐주는 시간(초). 0이면 닿는 즉시 붙잡는다
   */
  detect(msg: string, grace = 0): void {
    if (this.state !== 'play' || this.player.invulnT > 0) return;
    // 한 프레임에 여럿에 닿았으면 덜 봐주는 쪽을 따른다.
    this.arrestGrace = this.arrestMsg ? Math.min(this.arrestGrace, grace) : grace;
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
    this.room?.update({ phase: 'out' });
    this.hideGhosts();
    showFail(reason);
  }

  say(text: string): void {
    this.hud.say(text);
  }

  hintOnce(text: string): void {
    if (this.hints.has(text)) return;
    this.hints.add(text);
    this.hud.toast(text, 2.6, true);
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
    const readNick = (): string | null => {
      const nick = nickEl.value.trim();
      const err = validateNick(nick);
      $('nick-error').textContent = err ?? '';
      if (err) return null;
      nickEl.blur();
      return nick;
    };
    const start = () => {
      const nick = readNick();
      if (nick) this.start(nick);
    };
    $('btn-start').addEventListener('click', start);
    nickEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') start();
    });
    $('btn-multi').addEventListener('click', () => {
      const nick = readNick();
      if (!nick) return;
      this.nick = nick;
      showLobby(true);
      lobbyFind();
      // 초대 링크로 들어왔으면 방 번호를 다시 묻지 않고 바로 그 방으로 들어간다.
      if (this.invite) this.enterRoom(this.invite, 'join');
    });
    const codeEl = $('room-code') as HTMLInputElement;
    const join = () => {
      const code = codeEl.value.trim();
      if (!/^\d{4}$/.test(code)) {
        lobbyFind('방 번호 네 자리 숫자를 넣어 주세요.');
        return;
      }
      codeEl.blur();
      this.enterRoom(code, 'join');
    };
    $('btn-room-join').addEventListener('click', join);
    codeEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
    });
    $('btn-room-new').addEventListener('click', () => this.enterRoom(Game.newCode(), 'create'));
    $('btn-lobby-back').addEventListener('click', () => showLobby(false));
    $('btn-room-link').addEventListener('click', () => this.copyInvite());
    $('btn-room-go').addEventListener('click', () => this.launch());
    $('btn-room-leave').addEventListener('click', () => this.leaveRoom(''));
    // 창을 닫거나 다른 곳으로 가면 방에서 바로 빠져, 남은 사람들이 기다리지 않게 한다.
    window.addEventListener('pagehide', () => this.room?.leave());
    $('btn-rank').addEventListener('click', () => showRanking(false));
    $('btn-rank2').addEventListener('click', () => showRanking(false));
    $('tab-all').addEventListener('click', () => showRanking(false));
    $('tab-today').addEventListener('click', () => showRanking(true));
    $('btn-rank-close').addEventListener('click', () => $('rank').classList.add('hidden'));
    $('btn-share').addEventListener('click', () => this.result && shareCard(this.result, false));
    $('btn-save').addEventListener('click', () => this.result && shareCard(this.result, true));
    $('btn-retry').addEventListener('click', () => this.again());
    $('btn-fail-retry').addEventListener('click', () => this.again());
  }

  /**
   * 판을 마치고 처음으로 돌아간다. 혼자 했으면 닉네임을 새로 넣도록 처음 화면으로, 함께 했으면 같은 이름으로 그 방으로 돌아간다.
   * 판의 상태를 통째로 비우기 위해 화면을 새로 불러온다.
   * @author heojeehaeng(claude)
   */
  private again(): void {
    const room = this.room;
    if (room) {
      try {
        sessionStorage.setItem(BACK_KEY, JSON.stringify({ code: room.code, nick: this.nick }));
      } catch {
        // 저장할 수 없으면 방 번호만 주소로 넘기고 이름은 다시 받는다.
      }
      room.leave();
    }
    location.href = pageUrl(room ? room.code : null);
  }

  /**
   * 방 번호로 쓸 네 자리 숫자를 무작위로 만든다.
   * @author heojeehaeng(claude)
   * @return {string} 방 번호
   */
  private static newCode(): string {
    return String(1000 + Math.floor(Math.random() * 9000));
  }

  /**
   * 주소에 방 번호가 있으면 그 방으로 이어 준다. 방금 그 방에서 달리고 돌아온 것이면 같은 이름으로 바로 들어가고,
   * 초대 링크로 처음 온 것이면 이름을 넣은 뒤 들어가도록 안내한다.
   * @author heojeehaeng(claude)
   */
  resume(): void {
    const code = new URLSearchParams(location.search).get('room') ?? '';
    if (!/^\d{4}$/.test(code)) return;
    (document.getElementById('room-code') as HTMLInputElement).value = code;
    let back: { code?: string; nick?: string } = {};
    try {
      back = JSON.parse(sessionStorage.getItem(BACK_KEY) ?? '{}');
      sessionStorage.removeItem(BACK_KEY);
    } catch {
      back = {};
    }
    if (back.code === code && typeof back.nick === 'string' && !validateNick(back.nick)) {
      (document.getElementById('nick') as HTMLInputElement).value = back.nick;
      this.nick = back.nick;
      showLobby(true);
      // 먼저 돌아온 사람이 빈 방에 들어가게 되므로, 방에 사람이 있는지는 따지지 않는다.
      this.enterRoom(code, 'either');
      return;
    }
    this.invite = code;
    const note = document.getElementById('invite-note')!;
    note.textContent = `이름을 넣고 멀티 플레이를 누르면 ${code}번 방으로 들어갑니다.`;
    note.classList.remove('hidden');
  }

  /**
   * 방에 들어가 참가자 목록을 띄운다. 새로 만드는 방 번호가 이미 쓰이고 있으면 다른 번호로 다시 해 본다.
   * @author heojeehaeng(claude)
   * @param {string} code 방 번호
   * @param {EnterMode} mode 들어가는 방법
   * @param {number} tries 방 번호를 바꿔 다시 해 본 횟수
   */
  private async enterRoom(code: string, mode: EnterMode, tries = 0): Promise<void> {
    if (this.room) return;
    lobbyFind('', true);
    try {
      const room = await Room.enter(code, this.nick, mode);
      // 기다리는 사이에 멀티 플레이 화면을 닫았으면 들어가지 않는다.
      if (this.state !== 'menu' || document.getElementById('lobby')!.classList.contains('hidden')) {
        room.leave();
        return;
      }
      this.room = room;
      this.invite = '';
      room.onPeers = () => this.onPeers();
      room.onPos = (m) => this.onPos(m);
      room.onGo = (race, crew) => {
        if (this.state === 'menu' && room.me.phase === 'lobby' && crew.includes(room.me.id)) this.startRace(room, race, crew);
      };
      room.onDrop = () => this.onDrop();
      this.onPeers();
    } catch (e) {
      const why = e instanceof Error ? e.message : '';
      if (mode === 'create' && why === 'taken' && tries < 5) {
        await this.enterRoom(Game.newCode(), 'create', tries + 1);
        return;
      }
      lobbyFind(ROOM_ERRORS[why] ?? '서버에 연결하지 못했습니다. 잠시 뒤 다시 해 주세요.');
    }
  }

  /**
   * 방에서 나와 방을 만들거나 찾는 화면으로 돌아간다.
   * @author heojeehaeng(claude)
   * @param {string} why 보여 줄 사유. 스스로 나갔으면 빈 문자열
   */
  private leaveRoom(why: string): void {
    this.room?.leave();
    this.room = null;
    lobbyFind(why);
  }

  /**
   * 초대 링크를 클립보드에 복사한다. 복사할 수 없는 환경이면 링크를 화면에 적어 준다.
   * @author heojeehaeng(claude)
   */
  private async copyInvite(): Promise<void> {
    if (!this.room) return;
    const url = pageUrl(this.room.code);
    const btn = document.getElementById('btn-room-link')!;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // 보안 연결(https)이 아니면 클립보드를 쓸 수 없으므로, 임시 입력칸을 골라 복사하는 옛 방법으로 넘어간다.
      const box = document.createElement('textarea');
      box.value = url;
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.append(box);
      box.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      box.remove();
    }
    if (ok) {
      btn.textContent = '복사했습니다!';
      window.setTimeout(() => (btn.textContent = '초대 링크 복사'), 1500);
    } else document.getElementById('room-status')!.textContent = url;
  }

  /**
   * 참가자 목록이나 누군가의 상태가 바뀌었을 때 화면과 경주 상태를 맞춘다.
   * @author heojeehaeng(claude)
   */
  private onPeers(): void {
    const room = this.room;
    if (!room) return;
    if (this.state === 'menu') this.lobbyChanged(room);
    else this.raceChanged(room);
  }

  /**
   * 출발을 기다리는 동안의 방 화면을 갱신한다. 방장이 출발시켰으면 따라서 출발한다.
   * @author heojeehaeng(claude)
   * @param {Room} room 들어가 있는 방
   */
  private lobbyChanged(room: Room): void {
    const me = room.me;
    const all = room.list();
    // 여럿이 동시에 들어와 정원을 넘겼으면 늦게 들어온 쪽이 물러난다.
    if (all.indexOf(me) >= ROOM_MAX) {
      this.leaveRoom(ROOM_ERRORS.full);
      return;
    }
    // 함께 출발할 사람으로 나를 올려 두고 달리기 시작한 사람이 있으면, 방장이 출발시킨 것이다.
    const starter = all.find((p) => p !== me && p.phase === 'race' && p.crew.includes(me.id));
    if (starter) {
      this.startRace(room, starter.race, starter.crew);
      return;
    }
    const waiting = all.filter((p) => p.phase === 'lobby');
    const host = waiting[0] === me;
    const rows: VersusRow[] = all.map((p) => ({
      nick: p.nick,
      color: p.phase === 'lobby' ? css(PEER_COLORS[waiting.indexOf(p)]) : '',
      me: p === me,
      tag: p === waiting[0] ? '방장' : '',
      note: p.phase === 'lobby' ? (p === me ? '나' : '') : p.phase === 'race' ? '달리는 중' : '경주를 마침',
    }));
    const status =
      waiting.length < 2 ? '동무가 한 명 더 들어오면 출발할 수 있습니다.' : host ? '다 모였으면 출발을 누르세요.' : '방장이 출발시키기를 기다리는 중…';
    fillLobby(room.code, rows, host, waiting.length >= 2, status);
  }

  /**
   * 방장이 출발 단추를 눌렀을 때, 기다리던 사람 모두와 함께 달리기 시작한다.
   * @author heojeehaeng(claude)
   */
  private launch(): void {
    const room = this.room;
    if (!room || this.state !== 'menu') return;
    const waiting = room.list().filter((p) => p.phase === 'lobby');
    if (waiting[0] !== room.me || waiting.length < 2) return;
    const seed = Game.newSeed();
    const crew = waiting.map((p) => p.id);
    room.sendGo(seed, crew);
    this.startRace(room, seed, crew);
  }

  /**
   * 함께 달리는 판을 준비한다. 모두 같은 시드로 적을 배치하고, 출발선에 나란히 서서 셋을 센다.
   * 달린 시간은 각자 자기 화면에서 재므로, 출발 신호가 조금 늦게 닿아도 기록에는 손해가 없다.
   * @author heojeehaeng(claude)
   * @param {Room} room 들어가 있는 방
   * @param {number} seed 모두가 함께 쓰는 배치 시드
   * @param {string[]} crew 함께 출발하는 사람들의 식별자
   */
  private startRace(room: Room, seed: number, crew: string[]): void {
    this.state = 'ready';
    this.seed = seed;
    this.crew = crew;
    this.rivals.clear();
    crew.forEach((id, i) => {
      if (id === room.me.id) return;
      this.rivals.set(id, { nick: room.peers.get(id)?.nick ?? '동무', color: PEER_COLORS[i % PEER_COLORS.length], phase: 'race', timeMs: 0 });
      this.addGhost(id);
    });
    room.update({ phase: 'race', race: seed, crew });
    showLobby(false);
    document.getElementById('menu')!.classList.add('hidden');
    document.getElementById('btn-retry')!.textContent = '방으로 돌아가기';
    document.getElementById('btn-fail-retry')!.textContent = '방으로 돌아가기';
    this.world.clearEntities();
    this.entities = buildEntities(this, seed);
    const p = this.player;
    // 모든 화면에서 같은 사람이 같은 색으로 보이도록, 나도 들어온 순서에 맞는 색을 입는다. 대사창의 얼굴 그림도 같은 색으로 맞춘다.
    const mine = PEER_COLORS[Math.max(0, crew.indexOf(room.me.id)) % PEER_COLORS.length];
    p.dress(mine);
    document.querySelectorAll('#shout [fill="#4f6a8f"]').forEach((el) => el.setAttribute('fill', css(mine)));
    document.querySelectorAll('#shout [fill="#3f5674"]').forEach((el) => el.setAttribute('fill', css(shade(mine))));
    p.respawn(0, 0);
    p.x = this.laneX(room.me.id);
    // 셋을 세는 동안에는 출발선에 서 있는다.
    p.state = 'stop';
    p.update(0, this.input);
    this.runMs = 0;
    this.countT = 0;
    this.countStep = 0;
    this.input.enabled = false;
    this.hud.show(true);
  }

  /**
   * 출발선에서 설 좌우 위치를 반환한다. 함께 출발하는 사람들이 겹치지 않게 나란히 선다.
   * @author heojeehaeng(claude)
   * @param {string} id 참가자 식별자
   * @return {number} 좌우 위치. 혼자 달릴 때는 가운데(0)
   */
  private laneX(id: string): number {
    const i = this.crew.indexOf(id);
    return i < 0 ? 0 : (i - (this.crew.length - 1) / 2) * 1.7;
  }

  /**
   * 함께 달리는 사람의 모습을 장면에 세운다. 이미 서 있으면 그대로 둔다.
   * @author heojeehaeng(claude)
   * @param {string} id 참가자 식별자
   */
  private addGhost(id: string): void {
    const rival = this.rivals.get(id);
    if (!rival || this.ghosts.has(id)) return;
    const ghost = new Ghost(rival.nick, rival.color, this.laneX(id));
    this.ghosts.set(id, ghost);
    this.scene.add(ghost.group);
  }

  /**
   * 함께 달리는 사람의 모습을 장면에서 치운다.
   * @author heojeehaeng(claude)
   * @param {string} id 참가자 식별자
   */
  private dropGhost(id: string): void {
    const ghost = this.ghosts.get(id);
    if (!ghost) return;
    this.scene.remove(ghost.group);
    this.ghosts.delete(id);
  }

  /**
   * 내 판이 끝났을 때 다른 사람들의 모습과 화면 표시를 모두 치운다. 결승 축하 장면이나 실패 화면에 겹쳐 보이지 않게 한다.
   * @author heojeehaeng(claude)
   */
  private hideGhosts(): void {
    for (const id of [...this.ghosts.keys()]) this.dropGhost(id);
    this.hud.peers([]);
    this.hud.place(0);
  }

  /**
   * 달리는 동안 다른 사람의 도착, 탈락, 퇴장을 반영한다.
   * @author heojeehaeng(claude)
   * @param {Room} room 들어가 있는 방
   */
  private raceChanged(room: Room): void {
    const running = this.state === 'play' || this.state === 'ready';
    for (const [id, rival] of this.rivals) {
      const peer = room.peers.get(id);
      if (!peer) {
        // 달리던 사람이 방에서 사라졌으면 나간 것으로 본다. 도착했거나 탈락한 뒤에 나간 사람의 기록은 남겨 둔다.
        if (rival.phase === 'race') {
          rival.phase = 'left';
          if (running) this.toast(`${rival.nick} 동무가 나갔습니다`, 1.6);
        }
      } else if (peer.phase === 'done' && rival.phase !== 'done') {
        rival.phase = 'done';
        rival.timeMs = peer.timeMs;
        if (running) this.toast(`${rival.nick} 동무 도착!`, 1.6);
      } else if (peer.phase === 'out' && rival.phase !== 'out') {
        rival.phase = 'out';
        if (running) this.toast(`${rival.nick} 동무 탈락!`, 1.6);
      } else if (peer.phase === 'race' && rival.phase === 'left') {
        // 연결이 잠깐 끊겼다가 돌아온 사람은 다시 달리는 것으로 되돌린다.
        rival.phase = 'race';
      }
      if (rival.phase === 'race' && running) this.addGhost(id);
      else this.dropGhost(id);
    }
    if (this.state === 'result') fillVersus(this.versusRows());
  }

  /**
   * 다른 사람의 위치 소식을 그 사람의 모습에 전한다. 다른 경주의 소식과 형식이 맞지 않는 소식은 버린다.
   * @author heojeehaeng(claude)
   * @param {PosMsg} m 위치 소식
   */
  private onPos(m: PosMsg): void {
    if (m[1] !== this.seed || m.length < 8 || !m.slice(2).every((v) => typeof v === 'number' && Number.isFinite(v))) return;
    this.ghosts.get(m[0])?.feed(Math.min(COURSE_LEN, Math.max(0, m[2])), m[3], Math.max(0, m[4]), m[5], Math.max(0, m[6]), m[7]);
  }

  /**
   * 방과의 연결이 끊겨 다시 붙지 못했을 때 뒤처리를 한다. 달리는 중이면 혼자서 끝까지 달리게 둔다.
   * @author heojeehaeng(claude)
   */
  private onDrop(): void {
    if (this.state === 'menu') {
      this.room = null;
      lobbyFind('서버와 연결이 끊겼습니다. 다시 들어가 주세요.');
      return;
    }
    for (const rival of this.rivals.values()) if (rival.phase === 'race') rival.phase = 'left';
    this.hideGhosts();
    if (this.state === 'play') this.toast('연결이 끊겨 혼자 달립니다', 2);
    if (this.state === 'result') fillVersus(this.versusRows());
  }

  /**
   * 결과 화면에 보여 줄 함께 달린 사람들의 순위를 만든다. 도착한 사람을 빠른 순으로 앞에 두고, 달리는 중, 탈락, 퇴장 순으로 잇는다.
   * @author heojeehaeng(claude)
   * @return {VersusRow[]} 순위 목록
   */
  private versusRows(): VersusRow[] {
    const order = { done: 0, race: 1, out: 2, left: 3 };
    // 내 옷 색도 다른 사람들처럼 들어온 순서로 정해져 있다.
    const myColor = PEER_COLORS[Math.max(0, this.crew.indexOf(this.room?.me.id ?? '')) % PEER_COLORS.length];
    const all = [
      { nick: this.nick, color: myColor, phase: 'done' as Rival['phase'], timeMs: Math.floor(this.runMs), me: true },
      ...[...this.rivals.values()].map((r) => ({ ...r, me: false })),
    ].sort((a, b) => order[a.phase] - order[b.phase] || a.timeMs - b.timeMs);
    return all.map((r, i) => ({
      nick: r.nick,
      color: css(r.color),
      me: r.me,
      tag: r.phase === 'done' ? `${i + 1}위` : '',
      note: r.phase === 'done' ? fmtTime(r.timeMs) : r.phase === 'race' ? '달리는 중…' : r.phase === 'out' ? '탈락' : '나감',
    }));
  }

  /**
   * 달리는 동안 내 위치를 알리고, 다른 사람들의 모습과 등수 표시를 갱신한다.
   * @author heojeehaeng(claude)
   * @param {Room} room 들어가 있는 방
   * @param {number} dt 프레임 시간(초)
   */
  private syncRace(room: Room, dt: number): void {
    const p = this.player;
    let flags = 0;
    if (p.sliding) flags |= POSE.SLIDE;
    if (p.hiding) flags |= POSE.CRAWL;
    if (p.state === 'fall') flags |= POSE.FALL;
    if (p.boosting) flags |= POSE.BOOST;
    this.sendT -= dt;
    this.sentAgo += dt;
    // 넘어지거나 질주를 시작하고 끝낸 순간은 속도가 크게 바뀌므로 다음 차례를 기다리지 않고 알린다. 그래도 너무 잦지 않게 간격을 둔다.
    const sudden = ((flags ^ this.sentFlags) & (POSE.FALL | POSE.BOOST)) !== 0 && this.sentAgo > 0.2;
    // 받을 사람이 없으면 보내지 않는다.
    if (this.ghosts.size > 0 && (this.sendT <= 0 || sudden)) {
      // 사람이 많을수록 주고받는 양이 인원의 제곱으로 늘어나므로, 방 하나가 쓰는 양이 일정하도록 보내는 간격을 늘린다.
      const n = this.ghosts.size + 1;
      this.sendT = Math.min(0.6, Math.max(0.13, (n * n) / ROOM_BUDGET));
      this.sentAgo = 0;
      this.sentFlags = flags;
      const r = (v: number) => Math.round(v * 100) / 100;
      room.sendPos([room.me.id, this.seed, r(p.d), r(p.x), r(p.y), r(p.vy), r(p.state === 'run' ? p.speed : 0), flags]);
    }
    let place = 1;
    const dots: { at: number; color: string }[] = [];
    for (const [id, rival] of this.rivals) {
      const ghost = this.ghosts.get(id);
      if (ghost) {
        ghost.update(dt, p.d);
        dots.push({ at: ghost.d / COURSE_LEN, color: css(rival.color) });
      }
      if (rival.phase === 'done' || (ghost && ghost.d > p.d)) place++;
    }
    this.hud.peers(dots);
    this.hud.place(place);
  }

  /**
   * 닉네임을 받아 혼자 달리기를 시작한다.
   * @author heojeehaeng(claude)
   * @param {string} nick 닉네임
   */
  private start(nick: string): void {
    this.nick = nick;
    document.getElementById('menu')!.classList.add('hidden');
    this.hud.show(true);
    this.player.respawn(0, 0);
    this.begin();
  }

  /**
   * 출발선에 선 리용길을 달리게 한다. 이때부터 시간을 잰다.
   * @author heojeehaeng(claude)
   */
  private begin(): void {
    this.player.state = 'run';
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
   * 함께 달리는 판의 출발선에서 셋을 센 뒤 출발시킨다.
   * @author heojeehaeng(claude)
   * @param {number} dt 프레임 시간(초)
   */
  private updateReady(dt: number): void {
    this.countT += dt;
    const steps: [number, () => void][] = [
      [0.4, () => this.toast('셋', 0.8)],
      [1.4, () => this.toast('둘', 0.8)],
      [2.4, () => this.toast('하나', 0.8)],
      [3.4, () => {
        this.toast('출발!', 1);
        this.begin();
      }],
    ];
    while (this.countStep < steps.length && this.countT >= steps[this.countStep][0]) steps[this.countStep++][1]();
    for (const ghost of this.ghosts.values()) ghost.update(dt, this.player.d);
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
    else if (this.state === 'ready') this.updateReady(dt);
    // 결과 화면이 뜬 뒤에도 뒤에서는 축하가 이어진다.
    else if (this.state === 'knock' || this.state === 'result') this.updateKnock(dt);
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
    if (this.room) this.syncRace(this.room, dt);
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
      // 판이 끝났으면 남은 적은 이번 프레임에 갱신하지 않는다.
      if (this.state !== 'play') break;
    }
    if (this.state !== 'play') return;
    // 시야나 빛에 닿은 시간을 잰다. 한 프레임이라도 벗어나면 처음부터 다시 잰다.
    this.seenT = this.arrestMsg ? this.seenT + dt : 0;
    if (this.arrestMsg && this.seenT >= this.arrestGrace) {
      this.seenT = 0;
      this.arrest(this.arrestMsg);
    }
    this.arrestMsg = null;
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
      // 함께 달리는 사람들에게는 문에 닿은 순간의 기록을 바로 알리고, 축하 장면에 겹치지 않게 그들의 모습을 치운다.
      // 시간은 화면에 적는 방식(버림)과 같게 보내, 내 화면과 남의 화면에 같은 기록이 보이게 한다.
      this.room?.update({ phase: 'done', timeMs: Math.floor(this.runMs) });
      this.hideGhosts();
    }
  }

  /**
   * 발각되어 붙잡힌 플레이어를 직전 체크포인트로 돌려보낸다. 시계는 멈추지 않는다.
   * 혼자 달릴 때는 적과 장애물을 새로 배치하고, 함께 달릴 때는 모두가 같은 코스를 달리도록 배치를 그대로 두고 리용길만 옮긴다.
   * @author heojeehaeng(claude)
   * @param {string} msg 발각 사유 문구
   */
  private arrest(msg: string): void {
    this.detections++;
    this.player.hits++;
    this.player.respawn(this.checkpoint, 1.5);
    this.world.clearEntities();
    // 함께 달릴 때는 같은 시드로 다시 만들어, 자리는 그대로 두고 이미 지나가며 움직여 놓은 것만 처음 상태로 되돌린다.
    this.entities = buildEntities(this, this.room ? this.seed : Game.newSeed());
    // 체크포인트로 돌아간 것을 다음 차례까지 기다리지 않고 알린다.
    this.sendT = 0;
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
      [PARTY_FROM, () => this.toast('"이라시야마쎼이!!!!!!!!"', 1.5)],
      [6.8, () => this.finish()],
    ];
    while (this.knockStep < steps.length && this.knockT >= steps[this.knockStep][0]) steps[this.knockStep++][1]();
    if (this.knockT > 2.0) {
      const door = this.decor.door;
      door.rotation.y += (-1.5 - door.rotation.y) * Math.min(1, dt * 6);
    }
    // 문이 열리면 생활관 인원들이 밖으로 나와 축하해 준다.
    this.decor.party.update(dt, this.knockT, this);
  }

  /**
   * 결승의 폭죽 색종이를 터뜨린다.
   * @author heojeehaeng(claude)
   * @param {number} x 터지는 자리 x
   * @param {number} y 터지는 자리 높이
   * @param {number} z 터지는 자리 z
   * @param {number} count 색종이 수
   * @param {number} vx 쏠려 날아가는 방향의 x 속도(m/s)
   * @param {number} vz 쏠려 날아가는 방향의 z 속도(m/s)
   */
  confetti(x: number, y: number, z: number, count: number, vx: number, vz: number): void {
    this.fx.confetti(x, y, z, count, vx, vz);
  }

  /**
   * 기록을 저장하고 결과 화면을 띄운다.
   * @author heojeehaeng(claude)
   */
  private finish(): void {
    this.state = 'result';
    this.hud.show(false);
    const p = this.player;
    const title = pickTitle(this.runMs, p.falls, this.detections, this.animalHits);
    // 서버에 닿지 못할 때를 대비해 이 기기에도 남겨 둔다.
    const local = saveRecord(this.nick, this.runMs);
    const result: RunResult = {
      nick: this.nick,
      timeMs: this.runMs,
      falls: p.falls,
      detections: this.detections,
      animalHits: this.animalHits,
      rank: 0,
      total: 0,
      title,
    };
    this.result = result;
    showResult(result);
    fillVersus(this.room ? this.versusRows() : null);
    // 순위는 서버가 알려 준다. 답이 오면 결과 화면의 순위를 채운다.
    submitOnline(this.nick, this.runMs, p.falls, this.detections, title)
      .then(({ rank, total }) => {
        result.rank = rank;
        result.total = total;
      })
      .catch(() => {
        // 서버에 올리지 못했으면 이 기기의 기록으로 매긴 순위를 보여 준다.
        result.rank = local.rank;
        result.total = local.total;
        result.local = true;
      })
      .finally(() => showResult(result));
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
    // 문이 열리고 사람들이 나오기 시작하면 모두가 화면에 들어오도록 카메라를 뒤로 물리고 가운데로 옮긴다.
    this.partyK += ((close && this.knockT > PARTY_FROM - 0.2 ? 1 : 0) - this.partyK) * Math.min(1, dt * 3);
    const wide = this.partyK;
    // 결승 연출에서는 문을 여는 병사가 리용길에 가리지 않도록 카메라를 옆으로 옮긴다.
    const cx = close ? 1.7 - wide * 0.7 : p.x * 0.55;
    const back = close ? 4.2 + wide * 1.5 : 7.2;
    // 슬라이드하는 동안에는 카메라가 바닥 가까이 내려와 바짝 따라붙어, 땅을 스치는 속도감을 준다.
    const k = close ? 0 : this.slideK;
    this.camera.position.set(cx + sx, (close ? 2.6 + wide * 0.2 : 3.8 - k * 0.8) + sy, -p.d + back - k * 1.2);
    this.camera.lookAt(close ? 0.3 + wide * 0.2 : cx, close ? 1.4 - wide * 0.1 : 1.0 - k * 0.2, -p.d - (close ? 7 : 10));
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
    if (this.outline) {
      this.outline.setGrade(env.tint, env.grade, env.ink);
      this.outline.render(this.scene, this.camera);
    } else this.renderer.render(this.scene, this.camera);

    this.hud.rush(this.state === 'play' && p.boosting);
    this.hud.skid(sliding && !p.boosting);

    if (this.state === 'play' || this.state === 'knock' || this.state === 'ready') {
      this.hud.update(this.runMs, p.d / COURSE_LEN, stageAt(p.d).name);
    }
  }
}

// 배경 모델을 먼저 받아야 코스를 만들 수 있으므로, 그동안 시작 단추를 잠가 둔다.
const startBtn = document.getElementById('btn-start') as HTMLButtonElement;
const multiBtn = document.getElementById('btn-multi') as HTMLButtonElement;
startBtn.disabled = multiBtn.disabled = true;
startBtn.textContent = '준비 중…';
// 말풍선은 캔버스에 그려 두므로, 그리기 전에 웹 글꼴을 받아 둔다. 인터넷이 안 되면 2.5초 뒤 기본 글꼴로 넘어가고, 글꼴이 늦게 오면 그때 다시 그린다.
const fonts = Promise.race([
  document.fonts.load(`800 40px ${FONT}`, BUBBLE_TEXT),
  new Promise((resolve) => window.setTimeout(resolve, 2500)),
]).catch(() => undefined);
const models = loadProps((done, total) => {
  startBtn.textContent = `준비 중 ${Math.round((done / total) * 100)}%`;
});
Promise.all([models, fonts]).then(() => {
  const game = new Game();
  startBtn.disabled = multiBtn.disabled = false;
  startBtn.textContent = '솔로 플레이';
  // 주소에 방 번호가 있으면 그 방으로 이어 준다.
  game.resume();
  // 개발 서버에서만 콘솔로 상태를 들여다볼 수 있게 한다.
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __game: Game }).__game = game;
});

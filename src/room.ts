import { KEY } from './rank';

/** 실시간 서버(Supabase Realtime)의 주소. 라이브러리 없이 웹소켓으로 직접 붙는다 */
const WS_URL = 'wss://wlkgwhxcqxazchnyooml.supabase.co/realtime/v1/websocket';
/** 한 방에 들어갈 수 있는 인원 */
export const ROOM_MAX = 4;
/**
 * 한 방이 1초에 주고받는 위치 소식의 상한(건). 서버는 보낸 것과 받은 것을 모두 세고 무료 요금제는 프로젝트 전체가 초당 100건이므로,
 * 방 하나가 이만큼만 쓰게 해서 세 방까지 동시에 달릴 수 있게 한다.
 */
export const ROOM_BUDGET = 30;
/** 연결이 끊겼을 때 다시 붙기까지 기다리는 시간(ms). 뒤로 갈수록 길게 기다린다 */
const RETRY_MS = [1000, 2000, 5000, 10000];
/** 이 횟수만큼 다시 붙지 못하면 포기한다 */
const RETRY_MAX = 6;

/** 방 안에서의 상태. lobby는 출발 대기, race는 달리는 중, done은 도착, out은 탈락이다 */
export type Phase = 'lobby' | 'race' | 'done' | 'out';

export interface Peer {
  /** 이 접속에만 쓰는 임의의 식별자 */
  id: string;
  nick: string;
  /** 방에 들어온 시각(ms). 가장 먼저 들어온 사람이 방장이 된다 */
  at: number;
  phase: Phase;
  /** 달리고 있는 경주의 배치 시드. 같은 시드끼리 같은 코스를 달린다 */
  race: number;
  /** 그 경주에 함께 출발한 사람들의 식별자. 순서가 곧 색 순서다 */
  crew: string[];
  /** 도착 소요 시간(ms). 도착하기 전에는 0이다 */
  timeMs: number;
}

/** 위치 소식: [식별자, 경주 시드, 달린 거리, 좌우 위치, 높이, 수직 속도, 앞으로 가는 속도, 자세] */
export type PosMsg = [string, number, number, number, number, number, number, number];

/** 방에 들어가는 방법. create는 빈 방만, join은 사람이 있는 방만, either는 가리지 않는다 */
export type EnterMode = 'create' | 'join' | 'either';

/**
 * 접속마다 새로 쓰는 임의의 식별자를 만든다.
 * @author heojeehaeng(claude)
 * @return {string} 식별자
 */
function makeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}

/**
 * 서버가 전해 준 참가자 정보를 검사해 읽는다. 다른 기기가 보낸 값이므로 형식이 맞지 않으면 버린다.
 * @author heojeehaeng(claude)
 * @param {string} id 참가자 식별자
 * @param {Object} m 참가자가 올려 둔 정보
 * @return {Peer|null} 참가자. 읽을 수 없으면 null
 */
function readPeer(id: string, m: Record<string, unknown> | undefined): Peer | null {
  if (!m || typeof m.nick !== 'string' || typeof m.at !== 'number' || !Number.isFinite(m.at)) return null;
  const phase = (['lobby', 'race', 'done', 'out'] as const).find((p) => p === m.phase) ?? 'lobby';
  const crew = Array.isArray(m.crew) ? m.crew.filter((s): s is string => typeof s === 'string').slice(0, ROOM_MAX) : [];
  return { id, nick: m.nick.slice(0, 8), at: m.at, phase, race: Number(m.race) || 0, crew, timeMs: Number(m.timeMs) || 0 };
}

/**
 * 멀티 플레이 방. 같은 방 번호로 들어온 사람들의 상태를 함께 보고 위치 소식을 주고받는다.
 * 참가자 목록과 상태는 서버가 맞춰 주는 참가자 명부(presence)로, 달리는 위치는 흘려보내는 소식(broadcast)으로 다룬다.
 */
export class Room {
  /** 나 자신 */
  readonly me: Peer;
  /** 나를 포함해 지금 방에 있는 사람들 */
  readonly peers = new Map<string, Peer>();
  /** 참가자 목록이나 누군가의 상태가 바뀌었을 때 불린다 */
  onPeers: () => void = () => undefined;
  /** 다른 사람의 위치 소식이 왔을 때 불린다 */
  onPos: (m: PosMsg) => void = () => undefined;
  /** 방장의 출발 신호가 왔을 때 불린다. 경주의 배치 시드와 함께 출발하는 사람들의 식별자를 받는다 */
  onGo: (race: number, crew: string[]) => void = () => undefined;
  /** 연결이 끊겨 다시 붙지 못했을 때 불린다 */
  onDrop: () => void = () => undefined;
  private ws: WebSocket | null = null;
  private refNo = 0;
  private joinRef = '';
  private beat = 0;
  private left = false;
  private entered = false;
  private joined = false;
  private retries = 0;
  private readonly topic: string;

  private constructor(readonly code: string, nick: string) {
    this.topic = `realtime:talbook-room-${code}`;
    this.me = { id: makeId(), nick, at: Date.now(), phase: 'lobby', race: 0, crew: [], timeMs: 0 };
    this.peers.set(this.me.id, this.me);
  }

  /**
   * 방에 들어간다. 들어갈 수 없으면 사유(taken, empty, full, timeout, closed, refused)를 담은 예외를 던진다.
   * @author heojeehaeng(claude)
   * @param {string} code 방 번호
   * @param {string} nick 내 이름
   * @param {EnterMode} mode 들어가는 방법
   * @return {Promise} 들어간 방
   */
  static async enter(code: string, nick: string, mode: EnterMode): Promise<Room> {
    const room = new Room(code, nick);
    let others = 0;
    try {
      others = await room.connect();
    } catch (e) {
      room.leave();
      throw e;
    }
    // 새로 만드는 방 번호를 이미 누가 쓰고 있거나, 찾아간 방에 아무도 없거나, 방이 찼으면 들어가지 않는다.
    const fail = mode === 'create' && others > 0 ? 'taken' : mode === 'join' && others === 0 ? 'empty' : others >= ROOM_MAX ? 'full' : '';
    if (fail) {
      room.leave();
      throw new Error(fail);
    }
    room.entered = true;
    room.track();
    return room;
  }

  /**
   * 서버에 붙어 방 채널에 들어가고, 먼저 와 있는 사람들의 목록을 받는다.
   * @author heojeehaeng(claude)
   * @return {Promise} 나를 뺀 방 안의 사람 수
   */
  private connect(): Promise<number> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let stateTimer = 0;
      const ws = new WebSocket(`${WS_URL}?apikey=${KEY}&vsn=1.0.0`);
      const done = (err?: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.clearTimeout(stateTimer);
        if (err) reject(new Error(err));
        else resolve(this.peers.size - 1);
      };
      const timer = window.setTimeout(() => {
        done('timeout');
        ws.close();
      }, 8000);
      this.ws = ws;
      this.joined = false;
      ws.onopen = () => {
        this.joinRef = this.nextRef();
        this.push('phx_join', { config: { broadcast: { ack: false, self: false }, presence: { enabled: true, key: this.me.id }, private: false } }, this.joinRef);
        window.clearInterval(this.beat);
        // 서버는 25초 넘게 소식이 없으면 연결을 끊으므로 그보다 자주 살아 있음을 알린다.
        this.beat = window.setInterval(() => this.raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: this.nextRef() }), 20000);
      };
      ws.onmessage = (e) => {
        let msg: { topic?: string; event?: string; ref?: string; payload?: Record<string, unknown> };
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (msg.topic !== this.topic || !msg.payload) return;
        if (msg.event === 'phx_reply' && msg.ref === this.joinRef) {
          if (msg.payload.status !== 'ok') {
            done('refused');
            ws.close();
            return;
          }
          this.joined = true;
          // 방에 아무도 없으면 참가자 목록이 오지 않을 수 있다. 잠깐 기다려도 오지 않으면 빈 방으로 본다.
          stateTimer = window.setTimeout(() => {
            if (settled) return;
            this.readState({});
            done();
          }, 1500);
        } else if (msg.event === 'presence_state') {
          this.readState(msg.payload);
          done();
          this.onPeers();
        } else if (msg.event === 'presence_diff') {
          this.readDiff(msg.payload);
          this.onPeers();
        } else if (msg.event === 'broadcast') {
          const body = msg.payload.payload as Record<string, unknown> | unknown[] | undefined;
          if (msg.payload.event === 'p' && Array.isArray(body)) this.onPos(body as PosMsg);
          else if (msg.payload.event === 'go' && body && !Array.isArray(body) && typeof body.race === 'number' && Array.isArray(body.crew)) {
            this.onGo(body.race, body.crew.filter((s): s is string => typeof s === 'string').slice(0, ROOM_MAX));
          }
        } else if (msg.event === 'phx_close' || msg.event === 'phx_error') {
          ws.close();
        }
      };
      ws.onclose = () => {
        this.joined = false;
        done('closed');
        // 방에 들어온 뒤에 끊긴 것이면 다시 붙는다. 들어오다 실패한 것과 스스로 나간 것은 그대로 둔다.
        if (this.entered && !this.left && this.ws === ws) this.retry();
      };
    });
  }

  /**
   * 끊긴 연결을 조금 기다렸다가 다시 붙인다. 여러 번 실패하면 포기하고 알린다.
   * @author heojeehaeng(claude)
   */
  private retry(): void {
    if (this.retries >= RETRY_MAX) {
      this.left = true;
      window.clearInterval(this.beat);
      this.onDrop();
      return;
    }
    const wait = RETRY_MS[Math.min(this.retries, RETRY_MS.length - 1)];
    this.retries++;
    window.setTimeout(() => {
      if (this.left) return;
      this.connect()
        .then(() => {
          this.retries = 0;
          this.track();
        })
        // 실패하면 연결이 닫히면서 다음 재시도가 예약된다.
        .catch(() => undefined);
    }, wait);
  }

  /**
   * 서버가 보내 준 전체 참가자 명부로 목록을 새로 채운다.
   * @author heojeehaeng(claude)
   * @param {Object} state 식별자별 참가자 정보
   */
  private readState(state: Record<string, unknown>): void {
    this.peers.clear();
    this.peers.set(this.me.id, this.me);
    this.readJoins(state);
  }

  /**
   * 참가자 명부의 바뀐 부분을 목록에 반영한다. 상태를 고친 사람은 나간 쪽과 들어온 쪽에 함께 실려 오므로 나간 쪽을 먼저 처리한다.
   * @author heojeehaeng(claude)
   * @param {Object} diff 들어온 사람(joins)과 나간 사람(leaves)
   */
  private readDiff(diff: Record<string, unknown>): void {
    const leaves = (diff.leaves ?? {}) as Record<string, unknown>;
    for (const id of Object.keys(leaves)) if (id !== this.me.id) this.peers.delete(id);
    this.readJoins((diff.joins ?? {}) as Record<string, unknown>);
  }

  private readJoins(joins: Record<string, unknown>): void {
    for (const [id, v] of Object.entries(joins)) {
      if (id === this.me.id) continue;
      const metas = (v as { metas?: Record<string, unknown>[] } | null)?.metas;
      const peer = readPeer(id, Array.isArray(metas) ? metas[metas.length - 1] : undefined);
      if (peer) this.peers.set(id, peer);
    }
  }

  private nextRef(): string {
    return String(++this.refNo);
  }

  private raw(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private push(event: string, payload: object, ref = this.nextRef()): void {
    this.raw({ topic: this.topic, event, payload, ref, join_ref: this.joinRef });
  }

  /**
   * 내 상태를 참가자 명부에 올린다.
   * @author heojeehaeng(claude)
   */
  private track(): void {
    if (!this.joined) return;
    const { nick, at, phase, race, crew, timeMs } = this.me;
    this.push('presence', { type: 'presence', event: 'track', payload: { nick, at, phase, race, crew, timeMs } });
  }

  /**
   * 내 상태를 고쳐 방 안의 모두에게 알린다.
   * @author heojeehaeng(claude)
   * @param {Object} patch 바꿀 항목
   */
  update(patch: Partial<Pick<Peer, 'phase' | 'race' | 'crew' | 'timeMs'>>): void {
    Object.assign(this.me, patch);
    this.track();
    this.onPeers();
  }

  /**
   * 내 위치 소식을 방 안의 다른 사람들에게 보낸다. 받았는지 확인하지 않으며, 연결이 끊겨 있으면 버린다.
   * @author heojeehaeng(claude)
   * @param {PosMsg} m 위치 소식
   */
  sendPos(m: PosMsg): void {
    if (this.joined) this.push('broadcast', { type: 'broadcast', event: 'p', payload: m });
  }

  /**
   * 방 안의 다른 사람들에게 출발 신호를 보낸다. 참가자 명부는 바뀐 내용이 닿는 데 1~2초가 걸려 다 같이 출발하기에는 늦으므로,
   * 바로 닿는 소식으로 따로 알린다. 이 신호를 놓친 사람은 명부에 올라온 내 상태를 보고 뒤늦게 출발한다.
   * @author heojeehaeng(claude)
   * @param {number} race 경주의 배치 시드
   * @param {string[]} crew 함께 출발하는 사람들의 식별자
   */
  sendGo(race: number, crew: string[]): void {
    if (this.joined) this.push('broadcast', { type: 'broadcast', event: 'go', payload: { race, crew } });
  }

  /**
   * 방에 있는 사람들을 들어온 순서대로 반환한다. 모든 기기에서 같은 순서가 나오도록 시각이 같으면 식별자로 가른다.
   * @author heojeehaeng(claude)
   * @return {Peer[]} 들어온 순서의 참가자 목록
   */
  list(): Peer[] {
    return [...this.peers.values()].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  }

  /**
   * 방에서 나간다.
   * @author heojeehaeng(claude)
   */
  leave(): void {
    this.left = true;
    window.clearInterval(this.beat);
    if (this.joined) this.push('phx_leave', {});
    this.ws?.close();
  }
}

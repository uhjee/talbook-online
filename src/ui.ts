const RANK_KEY = 'talbook.records.v1';
const BAD_WORDS = ['시발', '씨발', '병신', '개새', '좆', 'fuck', 'shit'];

export interface RunResult {
  nick: string;
  timeMs: number;
  falls: number;
  detections: number;
  animalHits: number;
  rank: number;
  total: number;
  title: string;
}

interface RecordRow {
  n: string;
  t: number;
  at: number;
}

const $ = (id: string) => document.getElementById(id)!;

/**
 * 밀리초를 "분:초.00" 형식으로 바꾼다.
 * @author heojeehaeng(claude)
 * @param {number} ms 시간(ms)
 * @return {string} 형식화된 시간
 */
export function fmtTime(ms: number): string {
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/**
 * 닉네임을 검사한다. 문제가 없으면 null을, 있으면 안내 문구를 반환한다.
 * @author heojeehaeng(claude)
 * @param {string} nick 입력한 닉네임
 * @return {string|null} 오류 안내 문구 또는 null
 */
export function validateNick(nick: string): string | null {
  if (nick.length < 2 || nick.length > 8) return '닉네임은 2~8자로 입력해 주세요.';
  const lower = nick.toLowerCase();
  if (BAD_WORDS.some((w) => lower.includes(w))) return '사용할 수 없는 닉네임입니다.';
  return null;
}

/**
 * 완주 기록에 맞는 칭호를 고른다. 조건이 여러 개 맞으면 앞선 칭호를 준다.
 * @author heojeehaeng(claude)
 * @param {number} timeMs 도착 소요 시간(ms)
 * @param {number} falls 넘어진 횟수
 * @param {number} detections 발각되어 붙잡힌 횟수
 * @param {number} animalHits 동물에게 당한 횟수
 * @return {string} 칭호
 */
export function pickTitle(timeMs: number, falls: number, detections: number, animalHits: number): string {
  if (detections === 0) return '노크의 달인';
  if (falls === 0) return '유령 귀순';
  if (timeMs < 240000) return '번개 리용길';
  if (animalHits >= 3) return '동물의 왕국 생존자';
  if (falls >= 10) return '칠전팔기';
  return '자유의 몸';
}

/**
 * 저장된 기록을 빠른 순으로 읽는다. 저장소를 쓸 수 없으면 빈 목록을 반환한다.
 * @author heojeehaeng(claude)
 * @param {boolean} todayOnly true면 오늘 등록된 기록만 반환한다
 * @return {RecordRow[]} 기록 목록
 */
export function loadRecords(todayOnly = false): RecordRow[] {
  let rows: RecordRow[] = [];
  try {
    rows = JSON.parse(localStorage.getItem(RANK_KEY) ?? '[]');
  } catch {
    rows = [];
  }
  if (todayOnly) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    rows = rows.filter((r) => r.at >= start.getTime());
  }
  return rows.sort((a, b) => a.t - b.t || a.at - b.at);
}

/**
 * 완주 기록을 저장하고 전체 순위를 반환한다.
 * 서버 랭킹을 붙이기 전까지는 이 기기의 브라우저 저장소에만 남긴다.
 * @author heojeehaeng(claude)
 * @param {string} nick 닉네임
 * @param {number} timeMs 도착 소요 시간(ms)
 * @return {Object} 순위(rank)와 전체 기록 수(total)
 */
export function saveRecord(nick: string, timeMs: number): { rank: number; total: number } {
  const rows = loadRecords();
  const row: RecordRow = { n: nick, t: Math.round(timeMs), at: Date.now() };
  rows.push(row);
  rows.sort((a, b) => a.t - b.t || a.at - b.at);
  try {
    localStorage.setItem(RANK_KEY, JSON.stringify(rows.slice(0, 500)));
  } catch {
    // 사생활 보호 모드 등으로 저장할 수 없어도 결과 화면은 보여 준다.
  }
  return { rank: rows.indexOf(row) + 1, total: rows.length };
}

export class Hud {
  private toastTimer = 0;
  private sayTimer = 0;

  private touch = window.matchMedia('(pointer: coarse)').matches;
  private keysKey = '';

  /**
   * 마지막으로 쓴 입력 장치를 지켜본다. 손가락으로 누르면 터치 동작 안내로, 키보드를 누르면 키 안내로 바꾼다.
   * @author heojeehaeng(claude)
   */
  constructor() {
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.touch = true;
    });
    window.addEventListener('keydown', () => {
      this.touch = false;
    });
  }

  /**
   * 대사를 자막으로 잠깐 띄운다. 새 대사가 오면 앞의 것을 바꾼다.
   * @author heojeehaeng(claude)
   * @param {string} text 대사
   * @param {boolean} hero true면 리용길의 대사로, 화면 가운데 아래에 크게 띄운다. false면 적의 대사로, 길을 가리지 않게 화면 위쪽에 작게 띄운다
   */
  say(text: string, hero = false): void {
    const el = $('taunt');
    el.textContent = hero ? `리용길: "${text}"` : `"${text}"`;
    el.classList.toggle('hero', hero);
    el.classList.add('on');
    window.clearTimeout(this.sayTimer);
    this.sayTimer = window.setTimeout(() => el.classList.remove('on'), hero ? 2400 : 1500);
  }

  /**
   * 화면 오른쪽 아래의 조작 안내판을 갱신한다. 키보드를 쓰면 키 모양으로, 터치 화면이면 손가락 동작으로 보여 준다.
   * @author heojeehaeng(claude)
   * @param {boolean} on 표시 여부
   * @param {string|null} focus 지금 익힐 동작(move, jump, slide, hide, boost). 해당 칸을 강조한다
   */
  keys(on: boolean, focus: string | null): void {
    // 매 프레임 불리므로 상태가 바뀌었을 때만 화면을 고친다.
    const key = `${on}|${focus}|${this.touch}`;
    if (key === this.keysKey) return;
    this.keysKey = key;
    const el = $('keys');
    el.classList.toggle('hidden', !on);
    el.classList.toggle('touch', this.touch);
    el.querySelectorAll<HTMLElement>('.k').forEach((k) => k.classList.toggle('on', k.dataset.act === focus));
  }

  /**
   * 게임 중 표시(시간, 진행도, 구간 이름)를 보이거나 숨긴다.
   * @author heojeehaeng(claude)
   * @param {boolean} on 표시 여부
   */
  show(on: boolean): void {
    $('hud').classList.toggle('hidden', !on);
  }

  /**
   * 시간, 진행도, 구간 이름 표시를 갱신한다.
   * @author heojeehaeng(claude)
   * @param {number} timeMs 흐른 시간(ms)
   * @param {number} progress 진행도(0~1)
   * @param {string} stage 구간 이름
   */
  update(timeMs: number, progress: number, stage: string): void {
    $('timer').textContent = fmtTime(timeMs);
    $('stage').textContent = stage;
    $('progress-fill').style.width = `${Math.min(100, progress * 100)}%`;
  }

  /**
   * 화면 가운데에 짧은 문구를 띄운다.
   * @author heojeehaeng(claude)
   * @param {string} msg 문구
   * @param {number} sec 표시 시간(초)
   */
  toast(msg: string, sec = 1.4): void {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('on'), sec * 1000);
  }
}

/**
 * 결과 화면에 기록을 채워 보여 준다.
 * @author heojeehaeng(claude)
 * @param {RunResult} r 완주 결과
 */
export function showResult(r: RunResult): void {
  $('res-time').textContent = fmtTime(r.timeMs);
  $('res-rank').textContent = `${r.rank}위 / ${r.total}명`;
  $('res-title').textContent = r.title;
  $('res-stats').textContent = `넘어짐 ${r.falls}회 · 발각 ${r.detections}회`;
  $('res-nick').textContent = r.nick;
  $('result').classList.remove('hidden');
}

/**
 * 탈북 실패 화면에 사유를 채워 보여 준다. 실패한 판에는 공유 카드를 주지 않는다.
 * @author heojeehaeng(claude)
 * @param {string} reason 실패 사유 문구
 */
export function showFail(reason: string): void {
  $('fail-reason').textContent = reason;
  $('fail').classList.remove('hidden');
}

/**
 * 랭킹 화면에 전체 또는 오늘 순위 상위 100명을 채워 보여 준다.
 * @author heojeehaeng(claude)
 * @param {boolean} todayOnly true면 오늘 순위를 보여 준다
 */
export function showRanking(todayOnly: boolean): void {
  const rows = loadRecords(todayOnly).slice(0, 100);
  const list = $('rank-list');
  list.innerHTML = '';
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '아직 탈북에 성공한 사람이 없습니다.';
    list.append(li);
  }
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    const no = document.createElement('span');
    no.textContent = `${i + 1}`;
    const name = document.createElement('span');
    name.textContent = r.n;
    const time = document.createElement('span');
    time.textContent = fmtTime(r.t);
    li.append(no, name, time);
    list.append(li);
  });
  $('tab-all').classList.toggle('on', !todayOnly);
  $('tab-today').classList.toggle('on', todayOnly);
  $('rank').classList.remove('hidden');
}

/**
 * 인스타그램 스토리 크기(1080x1920)의 인증 카드를 그린다.
 * @author heojeehaeng(claude)
 * @param {RunResult} r 완주 결과
 * @return {HTMLCanvasElement} 카드가 그려진 캔버스
 */
export function drawCard(r: RunResult): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 1080;
  cv.height = 1920;
  const g = cv.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 1920);
  sky.addColorStop(0, '#1d2b52');
  sky.addColorStop(0.6, '#5a5f8f');
  sky.addColorStop(1, '#f2a65a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1080, 1920);
  const font = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = `bold 64px ${font}`;
  g.fillText('탈북 온라인', 540, 190);
  g.font = `bold 150px ${font}`;
  g.fillStyle = '#ffe14d';
  g.fillText('탈북 성공!', 540, 380);

  // 생활관 문 앞에서 두 팔을 든 리용길
  g.fillStyle = '#8d8f7a';
  g.fillRect(140, 520, 800, 520);
  g.fillStyle = '#7a5230';
  g.fillRect(450, 700, 180, 340);
  g.fillStyle = '#2e4a2e';
  g.fillRect(340, 560, 400, 80);
  g.fillStyle = '#ffffff';
  g.font = `bold 48px ${font}`;
  g.fillText('SS사단 생활관', 540, 617);
  g.fillStyle = '#3d4f45';
  g.fillRect(0, 1040, 1080, 60);
  g.fillStyle = '#4a5d7a';
  g.fillRect(720, 820, 110, 130);
  g.fillRect(690, 730, 30, 110);
  g.fillRect(830, 730, 30, 110);
  g.fillStyle = '#3a3a3a';
  g.fillRect(730, 950, 38, 90);
  g.fillRect(782, 950, 38, 90);
  g.fillStyle = '#f1c9a5';
  g.beginPath();
  g.arc(775, 760, 78, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = '#ffffff';
  g.font = `bold 60px ${font}`;
  g.fillText('도착 소요 시간', 540, 1210);
  g.font = `bold 190px ${font}`;
  g.fillText(fmtTime(r.timeMs), 540, 1400);
  g.font = `bold 84px ${font}`;
  g.fillStyle = '#ffe14d';
  g.fillText(`${r.rank}위`, 540, 1520);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(190, 1570, 700, 110);
  g.fillStyle = '#ffffff';
  g.font = `bold 64px ${font}`;
  g.fillText(`「${r.title}」`, 540, 1647);
  g.font = `44px ${font}`;
  g.fillText(`넘어짐 ${r.falls}회 · 발각 ${r.detections}회`, 540, 1750);
  g.font = `bold 48px ${font}`;
  g.fillText(r.nick, 540, 1820);
  g.font = `34px ${font}`;
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText(location.host, 540, 1875);
  return cv;
}

/**
 * 인증 카드를 공유 창으로 내보낸다. 공유 창을 쓸 수 없으면 이미지로 저장한다.
 * @author heojeehaeng(claude)
 * @param {RunResult} r 완주 결과
 * @param {boolean} forceDownload true면 공유 창 없이 바로 저장한다
 */
export async function shareCard(r: RunResult, forceDownload: boolean): Promise<void> {
  const cv = drawCard(r);
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
  if (!blob) return;
  const file = new File([blob], 'talbook-online.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!forceDownload && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: '탈북 온라인', text: `탈북 성공! ${fmtTime(r.timeMs)} (${r.rank}위)` });
      return;
    } catch {
      // 공유 창을 닫은 경우에는 저장으로 넘어가지 않는다.
      return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(a.href);
}

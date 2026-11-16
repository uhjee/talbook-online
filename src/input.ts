/** 아래 방향키를 이 시간(ms)보다 길게 누르면 슬라이드가 아니라 숨기로 본다 */
const KEY_HOLD_MS = 220;
/** 화면을 움직이지 않고 이 시간(ms)보다 길게 누르면 숨기로 본다 */
const TOUCH_HOLD_MS = 320;
const SWIPE_PX = 40;
/** 이 시간(ms) 안에 화면을 두 번 두드리면 부스터로 본다 */
const DOUBLE_TAP_MS = 280;

export class Input {
  enabled = false;
  left = false;
  right = false;
  private downHeld = false;
  private downAt = 0;
  private jumpQ = false;
  private slideQ = false;
  private boostQ = false;
  private lastTap = 0;
  private drag = 0;
  private pid = -1;
  private sx = 0;
  private sy = 0;
  private lx = 0;
  private st = 0;
  private moved = false;
  private swiped = false;

  /**
   * 키보드(방향키, 스페이스바)와 터치 입력을 등록한다.
   * @author heojeehaeng(claude)
   * @param {HTMLElement} el 터치 입력을 받을 요소
   */
  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  /**
   * 숨기 입력(아래 방향키 또는 화면 길게 누르기)이 유지 중인지 반환한다.
   * @author heojeehaeng(claude)
   * @return {boolean} 숨기 입력 유지 여부
   */
  get hideHeld(): boolean {
    const now = performance.now();
    const key = this.downHeld && now - this.downAt > KEY_HOLD_MS;
    const touch = this.pid !== -1 && !this.moved && now - this.st > TOUCH_HOLD_MS;
    return this.enabled && (key || touch);
  }

  /**
   * 대기 중인 점프 입력을 꺼내고 비운다.
   * @author heojeehaeng(claude)
   * @return {boolean} 점프 입력 여부
   */
  takeJump(): boolean {
    const v = this.jumpQ;
    this.jumpQ = false;
    return v;
  }

  /**
   * 대기 중인 슬라이드 입력을 꺼내고 비운다.
   * @author heojeehaeng(claude)
   * @return {boolean} 슬라이드 입력 여부
   */
  takeSlide(): boolean {
    const v = this.slideQ;
    this.slideQ = false;
    return v;
  }

  /**
   * 대기 중인 부스터 입력(위 방향키 또는 화면 두 번 두드리기)을 꺼내고 비운다.
   * @author heojeehaeng(claude)
   * @return {boolean} 부스터 입력 여부
   */
  takeBoost(): boolean {
    const v = this.boostQ;
    this.boostQ = false;
    return v;
  }

  /**
   * 터치로 끈 좌우 이동량(m)을 꺼내고 비운다.
   * @author heojeehaeng(claude)
   * @return {number} 좌우 이동량(m)
   */
  takeDrag(): number {
    const v = this.drag;
    this.drag = 0;
    return v;
  }

  /**
   * 아직 쓰이지 않고 대기 중인 점프, 슬라이드, 부스터, 끌기 입력을 버린다.
   * 넘어져 있는 동안 누른 입력이 일어난 뒤에 뒤늦게 실행되지 않도록 하기 위한 것이다.
   * @author heojeehaeng(claude)
   */
  dropQueued(): void {
    this.jumpQ = this.slideQ = this.boostQ = false;
    this.drag = 0;
  }

  /**
   * 모든 입력 상태를 초기화한다.
   * @author heojeehaeng(claude)
   */
  clear(): void {
    this.left = this.right = this.downHeld = false;
    this.jumpQ = this.slideQ = this.boostQ = false;
    this.drag = 0;
    this.pid = -1;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.enabled) return;
    const k = e.code;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Space') return;
    e.preventDefault();
    if (k === 'ArrowLeft') this.left = down;
    else if (k === 'ArrowRight') this.right = down;
    else if (k === 'Space') {
      if (down && !e.repeat) this.jumpQ = true;
    } else if (k === 'ArrowUp') {
      if (down && !e.repeat) this.boostQ = true;
    } else if (down) {
      if (!e.repeat) {
        this.slideQ = true;
        this.downHeld = true;
        this.downAt = performance.now();
      }
    } else this.downHeld = false;
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled || this.pid !== -1) return;
    this.pid = e.pointerId;
    this.sx = this.lx = e.clientX;
    this.sy = e.clientY;
    this.st = performance.now();
    this.moved = this.swiped = false;
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pid) return;
    const dx = e.clientX - this.sx;
    const dy = e.clientY - this.sy;
    if (Math.hypot(dx, dy) > 12) this.moved = true;
    // 화면 폭 전체를 끌면 길 폭보다 조금 더 움직이도록 환산한다.
    this.drag += ((e.clientX - this.lx) / this.el.clientWidth) * 11;
    this.lx = e.clientX;
    if (!this.swiped && Math.abs(dy) > SWIPE_PX && Math.abs(dy) > Math.abs(dx) * 1.2) {
      this.swiped = true;
      if (dy < 0) this.jumpQ = true;
      else this.slideQ = true;
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pid) return;
    this.pid = -1;
    const now = performance.now();
    // 끌거나 길게 누르지 않은 짧은 두드림만 센다.
    if (this.moved || now - this.st > 250) return;
    if (now - this.lastTap < DOUBLE_TAP_MS) {
      this.boostQ = true;
      this.lastTap = 0;
    } else this.lastTap = now;
  }
}

// 사람과 비슷한 반응 속도로 자동 플레이하면서 넘어짐, 발각, 사망의 원인을 기록하는 개발용 도구.
// 개발 서버를 띄운 브라우저 콘솔에서 아래처럼 실행한다.
//   const { runAudit } = await import('/tools/audit.js'); await runAudit(3);

const LANES = [-3.4, -2.55, -1.7, -0.85, 0, 0.85, 1.7, 2.55, 3.4];
/** 판단한 뒤 손이 움직일 때까지 걸리는 시간(프레임). 12프레임은 0.2초다 */
const REACTION_FRAMES = 12;
const DT = 1 / 60;

const nameOf = (e) => (e ? e.constructor.name.replace('_', '') : '?');
const stageOf = (d) => (d < 750 ? '탄광' : d < 1950 ? '시내' : d < 3600 ? 'DMZ' : 'SS사단');

/**
 * 감시자의 부채꼴 시야 안에 주어진 자리가 들어가는지 확인한다.
 * @author heojeehaeng(claude)
 * @param {Object} w 감시자
 * @param {number} x 확인할 x
 * @param {number} d 확인할 거리(m)
 * @return {boolean} 시야 안에 있는지 여부
 */
function seenAt(w, x, d) {
  const rx = x - w.wx;
  const rz = -d + w.d;
  if (Math.hypot(rx, rz) > w.range + 0.2) return false;
  let df = Math.atan2(-rz, rx) - w.pivot.rotation.y;
  df = Math.atan2(Math.sin(df), Math.cos(df));
  return Math.abs(df) < 0.46;
}

/**
 * 현재 화면에 보이는 위협을 보고 갈 차선과 점프, 슬라이드, 숨기 여부를 정한다.
 * @author heojeehaeng(claude)
 * @param {Object} g 게임
 * @return {Object} 목표 x와 누를 동작
 */
function decide(g) {
  const p = g.player;
  const s = Math.max(p.speed, 12);
  const cost = LANES.map((x) => Math.abs(x - p.x) * 0.15);
  const block = (tx, r, w) => LANES.forEach((x, i) => (cost[i] += Math.abs(x - tx) < r ? w : 0));
  let jump = false;
  let slide = false;
  let hide = false;
  let calm = true;
  for (const e of g.entities) {
    const dd = e.d - p.d;
    if (dd > 115 || dd < -45) continue;
    const n = nameOf(e);
    if (n === 'Barrier') {
      if (e.spent || dd < 0 || dd > s * 1.5) continue;
      calm = false;
      if (e.kind === 'gap') LANES.forEach((x, i) => (cost[i] += Math.abs(x - e.x) > e.w / 2 - 0.5 ? 9 : 0));
      else if (e.kind === 'high') slide = slide || dd < s * 0.25;
      else if (e.w > 8) jump = jump || dd < s * 0.3;
      else {
        block(e.x, e.w / 2 + 0.4, 6);
        jump = jump || (dd < s * 0.3 && Math.abs(p.x - e.x) < e.w / 2 + 0.4);
      }
    } else if (n === 'Cart') {
      if (dd > 0 && dd < 50) block(e.x, 1.3, 6);
    } else if (n === 'Stalactite') {
      if (e.state !== 'hang' && dd > -1 && dd < s * 1.3) block(e.x, 1.3, 6);
    } else if (n === 'Grabber') {
      // 붙잡는 사람은 점프로 넘는다. 반응 지연을 감안해 미리 뛴다.
      if (dd > 0 && dd < s) calm = false;
      jump = jump || (dd > s * 0.25 && dd < s * 0.45 && Math.abs(e.x - p.x) < 2.5);
    } else if (n === 'PhoneWalker' || n === 'Mascot' || n === 'LDancer') {
      if (dd > 0 && dd < s) {
        calm = false;
        block(e.x, n === 'Mascot' ? 1.8 : 1.5, 6);
      }
    } else if (n === 'Watcher') {
      if (dd > -14 && dd < 26) {
        calm = false;
        for (let a = 0; a <= s * 0.3; a += 0.6) if (seenAt(e, p.x, p.d + a)) hide = true;
      }
      if (dd > -14 && dd < 45) LANES.forEach((x, i) => (cost[i] += Math.sign(x) === Math.sign(e.wx) ? 1.5 : 0));
    } else if (n === 'Shooter') {
      if (e.aiming && e.td - p.d > -2 && e.td - p.d < 32) block(e.tx, 1.2, 8);
    } else if (n === 'Mine') {
      if (!e.spent && dd > 0 && dd < s * 1.2) block(e.x, 1.0, 7);
    } else if (n === 'Bear') {
      if (dd > 0 && dd < 40) calm = false;
      slide = slide || (dd > 0 && dd < s * 0.55);
    } else if (n === 'Dasher') {
      if (e.state === 'run' || e.state === 'roar') calm = false;
      if (e.state === 'run' && Math.abs(e.dNow - p.d) < s * 0.35 && Math.abs(e.x - p.x) < 4) jump = true;
    } else if (n === 'Charger') {
      const dn = e.dNow - p.d;
      if (e.state === 'run' && dn > 0 && dn < 55) {
        calm = false;
        const closing = s - e.vd;
        const px = e.x + e.vx * (dn / closing);
        block(px, 1.5, 8);
        // 반응 지연을 감안해 미리 뛴다. 0.9m 높이를 넘겨 있는 시간은 약 0.4초다.
        jump = jump || (dn < closing * 0.5 && dn > closing * 0.3 && Math.abs(px - p.x) < 1.8);
      }
    } else if (n === 'Giraffe') {
      if (Math.abs(dd) < 10 + s * 0.15) slide = true;
    } else if (n === 'Giant') {
      const md = -e.mark.position.z - p.d;
      if (e.state === 'run') calm = false;
      if (e.mark.visible && md > -3 && md < 35) block(e.mark.position.x, 2.6, 20);
    } else if (n === 'Searchlight') {
      const sd = -e.spot.position.z - p.d;
      if (e.spot.visible && sd > -3 && sd < 28) {
        calm = false;
        block(e.spot.position.x, 2.6, 15);
      }
    } else if (n === 'Limo') {
      if (dd > 0 && dd < 110) {
        calm = false;
        block(e.x, 2.4, 12);
      }
    } else if (n === 'Crowd') {
      // 행진 대열 안으로 들어가면 감시자에게 보이지 않는다.
      if (p.d > e.d0 - 45 && p.d < e.d1) {
        LANES.forEach((x, i) => (cost[i] -= Math.abs(x - e.x) < 1.6 ? 5 : 0));
        if (Math.abs(p.x - e.x) < 1.8 && p.d > e.d0 - 5) hide = false;
      }
    }
  }
  let best = 0;
  cost.forEach((c, i) => (best = c < cost[best] ? i : best));
  return { x: LANES[best], jump, slide, hide, boost: calm };
}

/**
 * 자동 플레이를 여러 판 돌려 넘어짐, 발각, 사망의 원인별 횟수를 모은다.
 * 사망은 판을 끝내지 않고 기록만 한 뒤 계속 달린다.
 * @author heojeehaeng(claude)
 * @param {number} runs 돌릴 판 수
 * @return {Object} 원인별 집계와 구간별 소요 시간
 */
export async function runAudit(runs = 3) {
  const g = window.__game;
  const lv = await import('/src/level.ts');
  const p = g.player;
  const inp = g.input;
  const events = [];
  let current = null;
  let lastUp = -99;
  const hook = () => {
    for (const e of g.entities) {
      const proto = Object.getPrototypeOf(e);
      if (proto.__audited) continue;
      const update = proto.update;
      proto.update = function (dt, c) {
        current = this;
        return update.call(this, dt, c);
      };
      proto.__audited = true;
    }
  };
  const fall = p.fall.bind(p);
  p.fall = (dur, launch) => {
    const ok = fall(dur, launch);
    if (ok) events.push({ type: '넘어짐', by: nameOf(current), stage: stageOf(p.d), chain: g.time - lastUp < 1.2 });
    return ok;
  };
  const detect = g.detect.bind(g);
  g.detect = (msg) => {
    if (g.state === 'play' && p.invulnT <= 0 && !g.arrestMsg) {
      events.push({ type: '발각', by: nameOf(current), stage: stageOf(p.d), fallen: p.state === 'fall' });
    }
    detect(msg);
  };
  g.kill = () => events.push({ type: '사망', by: nameOf(current), stage: stageOf(p.d), fallen: p.state === 'fall' });

  const stageSec = {};
  const totals = [];
  if (g.state === 'menu') g.start('audit');
  for (let run = 0; run < runs; run++) {
    g.state = 'play';
    inp.enabled = true;
    g.world.clearEntities();
    g.entities = lv.buildEntities(g, Math.floor(Math.random() * 1e9));
    p.respawn(0, 1);
    g.checkpoint = 0;
    hook();
    const queue = [];
    let steps = 0;
    let prevState = p.state;
    while (g.state === 'play' && steps < 60 * 900) {
      queue.push(decide(g));
      const act = queue.length > REACTION_FRAMES ? queue.shift() : { x: p.x };
      inp.left = act.x < p.x - 0.3;
      inp.right = act.x > p.x + 0.3;
      if (act.jump) inp.jumpQ = true;
      if (act.slide) inp.slideQ = true;
      if (act.boost) inp.boostQ = true;
      inp.downHeld = Boolean(act.hide);
      inp.downAt = 0;
      g.time += DT;
      g.updatePlay(DT);
      hook();
      if (prevState === 'fall' && p.state === 'run') lastUp = g.time;
      prevState = p.state;
      const st = stageOf(p.d);
      stageSec[st] = (stageSec[st] || 0) + DT / runs;
      steps++;
    }
    totals.push({ sec: Math.round(steps / 60), finished: g.state === 'knock' });
  }
  const tally = {};
  for (const ev of events) {
    const key = `${ev.stage} / ${ev.by} / ${ev.type}`;
    const t = (tally[key] = tally[key] || { n: 0, chain: 0, fallen: 0 });
    t.n++;
    if (ev.chain) t.chain++;
    if (ev.fallen) t.fallen++;
  }
  const rows = Object.entries(tally)
    .map(([k, v]) => ({ k, perRun: +(v.n / runs).toFixed(1), chainPerRun: +(v.chain / runs).toFixed(1), fallenPerRun: +(v.fallen / runs).toFixed(1) }))
    .sort((a, b) => b.perRun - a.perRun);
  for (const k of Object.keys(stageSec)) stageSec[k] = Math.round(stageSec[k]);
  return { totals, stageSec, rows };
}

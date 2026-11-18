// 무작위 배치를 여러 번 만들어, 리용길의 동작 시간으로는 이어서 피할 수 없는 장애물 조합이 몇 번 나오는지 세는 개발용 도구.
// 배치 코드가 남긴 기록이 아니라 실제로 놓인 적과 장애물의 위치를 읽어 따진다.
// 개발 서버를 띄운 브라우저 콘솔에서 아래처럼 실행한다.
//   const { checkSpacing } = await import('/tools/spacing.js'); await checkSpacing(100);

const nameOf = (e) => e.constructor.name.replace('_', '');
const stageOf = (d) => (d < 750 ? '탄광' : d < 1950 ? '시내' : d < 3600 ? 'DMZ' : 'SS사단');
/** 구역 하나만 있으면 되는 종류. 처음 놓인 거리만으로 구역이 정해진다 */
const SIMPLE = { Bear: '곰', Dasher: '호랑이·고양이', Giraffe: '기린', Searchlight: '탐조등', PhoneWalker: '휴대폰 군인', LDancer: '춤추는 병사', Mascot: '굳건이', Limo: '장군 차' };
const BARRIER = { jump: '낮은 장애물', low: '들보', lane: '철책·반쪽 장애물' };

/**
 * 배치된 적과 장애물에서 동작 구역을 뽑는다. 한 번의 점프로 넘을 수 있게 모여 선 붙잡는 사람들은 한 구역으로 묶는다.
 * @author heojeehaeng(claude)
 * @param {Object[]} es 배치된 적 목록
 * @param {Object} en 적 모듈
 * @param {Object} sp 간격 규칙 모듈
 * @return {Object[]} 이름을 붙인 구역 목록
 */
function zonesOf(es, en, sp) {
  const zones = [];
  const grabbers = [];
  let phone = null;
  for (const e of es) {
    const n = nameOf(e);
    if (n === 'PhoneWalker') {
      // 7m 간격으로 함께 나온 두 사람은 앞사람부터 뒷사람까지를 한 구역으로 본다.
      const z = en.PhoneWalker.zone(e.d);
      if (phone && Math.abs(e.d - phone.d - 7) < 0.01) phone.zone.to = z.to;
      else {
        phone = { d: e.d, zone: { ...z, label: SIMPLE[n] } };
        zones.push(phone.zone);
      }
      continue;
    }
    if (n === 'Barrier') {
      const z = en.Barrier.zone(e.d, e.kind, e.w);
      zones.push({ ...z, label: BARRIER[z.need] });
    } else if (n === 'Grabber') grabbers.push(e);
    else if (n === 'Watcher') zones.push({ ...en.Watcher.zone(e.d, e.range), label: '감시자' });
    else if (n === 'Crowd') zones.push({ ...en.Crowd.zone(e.d0, e.d1), label: '감시자' });
    else if (SIMPLE[n]) zones.push({ ...en[n].zone(e.d), label: SIMPLE[n] });
  }
  grabbers.sort((a, b) => a.d - b.d);
  for (let i = 0; i < grabbers.length; ) {
    const first = grabbers[i];
    let last = first;
    // 같은 걸음으로 움직이고 깊이가 점프 한 번 안에 들어오는 사람들만 한 무리로 본다.
    while (i + 1 < grabbers.length && grabbers[i + 1].walk === first.walk && grabbers[i + 1].d - first.d + 1.2 <= sp.ONE_JUMP) last = grabbers[++i];
    i++;
    const lag = stageOf(first.d) === '시내' ? en.Grabber.CRAWL_LAG : 0;
    zones.push({ ...en.Grabber.zone(first.d, last.d - first.d, first.walk, lag), label: '붙잡는 사람' });
  }
  zones.sort((a, b) => a.from - b.from);
  // 행진 대열과 그 옆의 감시자처럼 겹쳐 있는 기어가기 구역은 하나로 합친다.
  const merged = [];
  for (const z of zones) {
    const prev = merged.find((m) => m.need === 'crawl' && z.need === 'crawl' && z.from <= m.to);
    if (prev) prev.to = Math.max(prev.to, z.to);
    else merged.push(z);
  }
  return merged;
}

/**
 * 배치를 여러 번 만들어 동작 간격 규칙에 어긋나는 조합과 구간별 장애물 수를 집계한다.
 * @author heojeehaeng(claude)
 * @param {number} seeds 만들어 볼 배치 수
 * @return {Object} 판당 어긋난 횟수(구간별, 조합별)와 구간별 종류별 평균 개수
 */
export async function checkSpacing(seeds = 100) {
  const g = window.__game;
  const lv = await import('/src/level.ts');
  const sp = await import('/src/spacing.ts');
  const en = await import('/src/entities.ts');
  const bad = {};
  const badStage = {};
  const count = {};
  let worst = null;
  for (let s = 1; s <= seeds; s++) {
    g.world.clearEntities();
    const es = lv.buildEntities(g, s * 7919);
    for (const e of es) {
      const n = nameOf(e);
      if (n === 'Hint' || n === 'Truck') continue;
      const key = `${stageOf(e.d)} ${n}`;
      count[key] = (count[key] || 0) + 1 / seeds;
    }
    const zones = zonesOf(es, en, sp);
    let n = 0;
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length && zones[j].from < zones[i].to + 30; j++) {
        const a = zones[i];
        const b = zones[j];
        const gap = sp.gapAfter(a.need, b.need);
        if (gap === undefined || b.from >= a.to + gap - 0.01) continue;
        const st = stageOf(b.from);
        const key = `${st} / ${a.label} → ${b.label}`;
        bad[key] = (bad[key] || 0) + 1 / seeds;
        badStage[st] = (badStage[st] || 0) + 1 / seeds;
        n++;
      }
    }
    if (!worst || n > worst.n) worst = { seed: s * 7919, n };
  }
  g.world.clearEntities();
  g.entities = lv.buildEntities(g, 1);
  const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(1)]).sort((a, b) => b[1] - a[1]));
  return { perRunByStage: round(badStage), perRunByPair: round(bad), countPerRun: round(count), worst };
}

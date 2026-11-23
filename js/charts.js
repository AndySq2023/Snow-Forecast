// SVG charts, no library. Colours come from CSS tokens in index.html so the
// charts and the page always agree.

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)']; // fixed order = resort order

const NS = 'http://www.w3.org/2000/svg';
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
// Open-Meteo local wall-clock strings ("2026-11-23T06:00") parsed as if UTC, then formatted as UTC: no TZ shifts.
const wall = (s) => new Date(s.length === 10 ? s + 'T00:00Z' : s + 'Z');

/** A floating tooltip shared by one chart container. */
function tooltip(container) {
  const tip = document.createElement('div');
  tip.className = 'tip';
  container.appendChild(tip);
  return {
    show(html, x, y) {
      tip.innerHTML = html;
      tip.classList.add('on');
      const w = container.clientWidth, tw = tip.offsetWidth;
      tip.style.left = Math.max(tw / 2, Math.min(w - tw / 2, x)) + 'px';
      tip.style.top = y + 'px';
    },
    hide() { tip.classList.remove('on'); },
  };
}

// ---------------------------------------------------------------- heatmap
// Sequential: one hue, recedes to the surface at zero and brightens towards
// white with more snow — on a dark page, more snow literally looks snowier.
export const HEAT_STEPS = [
  { min: 0, max: 0.5, color: 'var(--heat-0)', label: '0' },
  { min: 0.5, max: 2, color: '#104281', label: '<2' },
  { min: 2, max: 5, color: '#1c5cab', label: '2–5' },
  { min: 5, max: 10, color: '#2a78d6', label: '5–10' },
  { min: 10, max: 15, color: '#5598e7', label: '10–15' },
  { min: 15, max: 25, color: '#9ec5f4', label: '15–25' },
  { min: 25, max: Infinity, color: '#eaf3fe', label: '25+' },
];
const heatColor = (cm) => HEAT_STEPS.find((s) => cm < s.max)?.color ?? HEAT_STEPS.at(-1).color;

export function heatmap(container, report) {
  const rows = report.resorts.flatMap((r, i) => r.summit?.blocks ? [
    { resort: r, i, point: r.summit, label: r.name, sub: `top ${r.summit.elevation}m` },
    { resort: r, i, point: r.village, label: '', sub: `village ${r.village.elevation}m` },
  ] : []);
  if (!rows.length) {
    container.innerHTML = '<p class="empty">The forecast is unavailable right now.</p>';
    return;
  }
  const blocks = rows[0].point.blocks;
  const cell = 22, gap = 2, labelW = 180, headH = 34, rowGap = (k) => (k % 2 === 0 && k ? 10 : 0);
  let y = headH;
  const rowY = rows.map((_, k) => (y += (k ? cell + gap : 0) + rowGap(k)));
  const W = labelW + blocks.length * (cell + gap), H = rowY.at(-1) + cell + 4;
  const x = (b) => labelW + b * (cell + gap);
  const nowIdx = blocks.findIndex((b) => !b.past);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Snowfall every 6 hours for each resort, past two days and next seven">`;
  // day headers + separators
  blocks.forEach((b, k) => {
    if (b.start.endsWith('T00:00')) {
      const d = wall(b.start);
      svg += `<text x="${x(k) + 2 * (cell + gap) - gap / 2}" y="14" text-anchor="middle" class="ax${k === nowIdx - (nowIdx % 4) ? ' today' : ''}">${esc(fmtDay.format(d))}</text>`;
      if (k) svg += `<line x1="${x(k) - gap / 2}" x2="${x(k) - gap / 2}" y1="20" y2="${H}" class="sep"/>`;
    }
  });
  rows.forEach((row, k) => {
    const yy = rowY[k];
    if (row.label) svg += `<text x="0" y="${yy + 15}" class="rl">${esc(row.label)}</text>`;
    svg += `<text x="${labelW - 8}" y="${yy + 15}" text-anchor="end" class="rs">${esc(row.sub)}</text>`;
    row.point.blocks.forEach((b, j) => {
      svg += `<rect x="${x(j)}" y="${yy}" width="${cell}" height="${cell}" rx="3" fill="${heatColor(b.snowfallCm)}"${b.past ? ' opacity="0.55"' : ''} data-r="${k}" data-b="${j}"/>`;
    });
  });
  if (nowIdx > 0) {
    const nx = x(nowIdx) - gap / 2;
    svg += `<line x1="${nx}" x2="${nx}" y1="22" y2="${H}" class="now"/><text x="${nx + 4}" y="30" class="nowl">now</text>`;
  }
  svg += '</svg>';

  container.innerHTML = `<div class="scroll">${svg}</div>` + heatLegend() + heatTable(rows, blocks);
  const scroll = container.querySelector('.scroll');
  // Start scrolled so "now" is visible on narrow screens.
  if (nowIdx > 0) scroll.scrollLeft = Math.max(0, x(nowIdx) - labelW - 3 * (cell + gap));
  const tip = tooltip(container);
  const svgEl = scroll.querySelector('svg');
  const onCell = (e) => {
    const t = e.target;
    if (t.tagName !== 'rect' || t.dataset.r === undefined) return tip.hide();
    const row = rows[+t.dataset.r], b = row.point.blocks[+t.dataset.b];
    const start = wall(b.start), endH = String((start.getUTCHours() + 6) % 24).padStart(2, '0');
    const box = container.getBoundingClientRect(), r = t.getBoundingClientRect();
    tip.show(`<strong>${esc(row.resort.name)}</strong> · ${esc(row.sub)}<br>${esc(fmtLong.format(start))}, ${b.start.slice(11, 13)}–${endH}h` +
      `<br><b>${b.snowfallCm} cm</b> snow${b.freezingLevelM != null ? ` · freezing level ${b.freezingLevelM}m` : ''}${b.past ? ' · past' : ''}`,
      r.left - box.left + r.width / 2, r.top - box.top - 8);
  };
  svgEl.addEventListener('mousemove', onCell);
  svgEl.addEventListener('click', onCell);
  svgEl.addEventListener('mouseleave', () => tip.hide());
}

function heatLegend() {
  return `<div class="legend heat-legend"><span class="lt">cm per 6h</span>` +
    HEAT_STEPS.map((s) => `<span class="sw"><i style="background:${s.color}"></i>${s.label}</span>`).join('') +
    `<span class="lt">· faded = past</span></div>`;
}

function heatTable(rows, blocks) {
  const days = [...new Set(blocks.map((b) => b.start.slice(0, 10)))];
  return `<details><summary>Show as table (daily totals)</summary><div class="scroll"><table><thead><tr><th></th>${days.map((d) => `<th>${esc(fmtDay.format(wall(d)))}</th>`).join('')}</tr></thead><tbody>` +
    rows.map((row) => `<tr><td>${esc(row.resort.name)} ${esc(row.sub)}</td>${days.map((d) => {
      const t = row.point.blocks.filter((b) => b.start.startsWith(d)).reduce((a, b) => a + b.snowfallCm, 0);
      return `<td>${Math.round(t)}</td>`;
    }).join('')}</tr>`).join('') + '</tbody></table></div></details>';
}

// ---------------------------------------------------------------- season lines
export function seasonChart(container, report) {
  const series = report.resorts.map((r, i) => ({ r, i, pts: (r.measured?.history ?? []).filter((p) => p.depthCm != null) }))
    .filter((s) => s.pts.length);
  const missing = report.resorts.filter((r) => !(r.measured?.history ?? []).length).map((r) => r.name);
  if (!series.length) {
    container.innerHTML = '<p class="empty">No patrol readings yet this season.</p>';
    return;
  }
  const allDates = series.flatMap((s) => s.pts.map((p) => p.date)).sort();
  const t0 = wall(allDates[0]).getTime(), t1 = Math.max(wall(allDates.at(-1)).getTime(), t0 + 7 * 864e5);
  const maxD = Math.max(20, ...series.flatMap((s) => s.pts.map((p) => p.depthCm)));
  const yMax = Math.ceil(maxD / (maxD > 100 ? 50 : 10)) * (maxD > 100 ? 50 : 10);
  const W = 900, H = 300, L = 44, R = 110, T = 14, B = 28;
  const X = (d) => L + ((wall(d).getTime() - t0) / (t1 - t0)) * (W - L - R);
  const Y = (v) => T + (1 - v / yMax) * (H - T - B);

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Measured snow depth this season at each resort">`;
  for (let k = 0; k <= 4; k++) {
    const v = (yMax / 4) * k;
    svg += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="${k ? 'grid' : 'base'}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax">${v}</text>`;
  }
  // x ticks: about 6, on whole days
  const span = (t1 - t0) / 864e5, step = Math.max(1, Math.round(span / 6));
  for (let d = 0; d <= span; d += step) {
    const iso = new Date(t0 + d * 864e5).toISOString().slice(0, 10);
    svg += `<text x="${X(iso)}" y="${H - 8}" text-anchor="middle" class="ax">${esc(fmtDate.format(wall(iso)))}</text>`;
  }
  const ends = [];
  series.forEach((s) => {
    const d = s.pts.map((p, k) => `${k ? 'L' : 'M'}${X(p.date).toFixed(1)},${Y(p.depthCm).toFixed(1)}`).join('');
    svg += `<path d="${d}" fill="none" stroke="${SERIES[s.i]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.pts.length <= 40) s.pts.forEach((p) => { svg += `<circle cx="${X(p.date)}" cy="${Y(p.depthCm)}" r="4" fill="${SERIES[s.i]}" stroke="var(--panel)" stroke-width="2"/>`; });
    const last = s.pts.at(-1);
    ends.push({ s, x: X(last.date), y: Y(last.depthCm), v: last.depthCm });
  });
  // direct labels at the line ends, nudged apart so they never overlap
  ends.sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
  ends.forEach((e) => { svg += `<text x="${W - R + 8}" y="${e.y + 4}" class="dl">${esc(e.s.r.name)} <tspan class="dlv">${e.v}</tspan></text>`; });
  svg += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none"/>`;
  svg += `<rect class="hitzone" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`;

  container.innerHTML = `<div class="legend">${series.map((s) => `<span class="sw"><i class="line" style="background:${SERIES[s.i]}"></i>${esc(s.r.name)}</span>`).join('')}` +
    `<span class="lt">· depth in cm</span>` + (missing.length ? `<span class="lt">· no readings yet: ${esc(missing.join(', '))}</span>` : '') + `</div><div class="plot">${svg}</div>` +
    `<details><summary>Show as table</summary><div class="scroll"><table><thead><tr><th>Date</th>${series.map((s) => `<th>${esc(s.r.name)}</th>`).join('')}</tr></thead><tbody>` +
    [...new Set(allDates)].map((d) => `<tr><td>${esc(fmtDate.format(wall(d)))}</td>${series.map((s) => `<td>${s.pts.find((p) => p.date === d)?.depthCm ?? ''}</td>`).join('')}</tr>`).join('') +
    `</tbody></table></div></details>`;

  // crosshair: snap to the nearest day that has any reading, show every resort's latest value up to it
  const plot = container.querySelector('.plot'), svgEl = plot.querySelector('svg');
  const xh = svgEl.querySelector('.xh'), tip = tooltip(plot);
  const days = [...new Set(allDates)];
  svgEl.querySelector('.hitzone').addEventListener('mousemove', (e) => {
    const pt = svgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    const day = days.reduce((a, b) => (Math.abs(X(b) - p.x) < Math.abs(X(a) - p.x) ? b : a));
    xh.setAttribute('x1', X(day)); xh.setAttribute('x2', X(day)); xh.style.display = '';
    const lines = series.map((s) => {
      const v = [...s.pts].reverse().find((q) => q.date <= day);
      return `<span class="tk" style="background:${SERIES[s.i]}"></span>${esc(s.r.name)}: <b>${v ? v.depthCm + ' cm' : '–'}</b>${v && v.date !== day ? ` <span class="dim">(${esc(fmtDate.format(wall(v.date)))})</span>` : ''}`;
    });
    const scale = plot.clientWidth / W;
    tip.show(`<strong>${esc(fmtLong.format(wall(day)))}</strong><br>${lines.join('<br>')}`, X(day) * scale, T * scale);
  });
  svgEl.querySelector('.hitzone').addEventListener('mouseleave', () => { tip.hide(); xh.style.display = 'none'; });
}

// ---------------------------------------------------------------- mountain profile
/** A side-on mountain for one resort: depth at each altitude we know, the snow line and the freezing level. */
export function profile(r, snowLineM, color) {
  const m = r.measured, v = r.village, s = r.summit;
  const pts = [];
  if (v) pts.push({ elev: v.elevation, cm: v.depthCm, label: `${v.label}`, src: 'model' });
  if (m && m.depthCm != null && !m.lastSeason) pts.push({ elev: m.altitude, cm: m.depthCm, label: 'Patrol station', src: m.stale ? 'old reading' : 'measured' });
  if (s) pts.push({ elev: s.elevation, cm: s.depthCm, label: s.label, src: 'model' });
  const lo = Math.min(...pts.map((p) => p.elev)) - 350, hi = Math.max(...pts.map((p) => p.elev)) + 150;
  const W = 300, H = 110, k = W / 220, Y = (e) => H - ((e - lo) / (hi - lo)) * H;
  // a stylised ridge rising from the village (left) to the summit (right)
  const ridge = [[0, lo + 80], [30, lo + 250], [70, v ? v.elevation : lo + 400], [105, (v?.elevation ?? lo) + 250], [125, (v?.elevation ?? lo) + 180],
    [160, (s?.elevation ?? hi) - 300], [178, (s?.elevation ?? hi) - 380], [200, s ? s.elevation : hi - 150], [220, (s?.elevation ?? hi) - 200]];
  const path = `M0,${H}` + ridge.map(([x, e]) => `L${(x * k).toFixed(1)},${Y(e).toFixed(1)}`).join('') + `L${W},${H}Z`;
  const snowY = snowLineM != null ? Y(snowLineM) : null;
  const fl = v?.freezingLevelM;
  const id = 'clip-' + r.id;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="prof" aria-hidden="true"><defs><clipPath id="${id}"><path d="${path}"/></clipPath>` +
    `<linearGradient id="g-${r.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3a4b"/><stop offset="1" stop-color="#16202b"/></linearGradient></defs>` +
    `<path d="${path}" fill="url(#g-${r.id})"/>`;
  if (snowY !== null && snowY > 0) svg += `<rect x="0" y="0" width="${W}" height="${Math.min(H, snowY)}" fill="#e9f0f8" clip-path="url(#${id})" opacity="0.92"/>`;
  if (fl != null && fl > lo && fl < hi) svg += `<line x1="0" x2="${W}" y1="${Y(fl)}" y2="${Y(fl)}" class="fl"/><text x="4" y="${Y(fl) - 4}" class="fll">0°C ${fl}m</text>`;
  pts.forEach((p) => {
    const x = (p.label === 'Patrol station' ? 52 : p.elev === s?.elevation ? 200 : 70) * k;
    svg += `<circle cx="${x}" cy="${Y(p.elev)}" r="4" fill="${color}" stroke="var(--panel)" stroke-width="2"/>`;
  });
  svg += '</svg>';
  const list = [...pts].sort((a, b) => b.elev - a.elev).map((p) =>
    `<li><span class="pe">${p.elev}m</span><span class="pl">${esc(p.label)}</span><span class="pv">${p.cm == null ? '–' : p.cm + ' cm'}<small>${esc(p.src)}</small></span></li>`).join('');
  const higher = m && !m.lastSeason && m.depthHigherCm != null ? `<li class="hu"><span class="pe">higher</span><span class="pl">Patrol estimate</span><span class="pv">${m.depthHigherCm} cm<small>${m.stale ? 'old reading' : 'measured'}</small></span></li>` : '';
  return `<div class="profile">${svg}<ul>${higher}${list}</ul></div>`;
}

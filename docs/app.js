// Luxembourg job skills dashboard. Reads data/dashboard.json (made by notebook 06).
'use strict';

const GROUP_COLORS = ['#2563c9', '#d1553a', '#c99112', '#6d43b8', '#2f8a5a', '#5d6875'];
const SKILL_COLORS = ['#0a6b94', '#d1553a', '#2f8a5a', '#6d43b8', '#c99112', '#b2356f', '#5d6875', '#1f9aa8'];
const MAX_COMPARE = 8;

const state = { group: -1, domain: 'ALL', sort: 'top', limit: 20, compare: [] };
let D = null;          // the data file
let groupChart = null;
let skillChart = null;

const $ = (id) => document.getElementById(id);
const fmtPct = (x) => (x == null || !isFinite(x)) ? '–' : (x < 1 ? x.toFixed(2) : x.toFixed(1)) + '%';
const fmtInt = (x) => x.toLocaleString('en-US');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function yearIndex(years) { return years.map((y) => D.meta.years.indexOf(y)).filter((i) => i >= 0); }
function sumAt(arr, idx) { return idx.reduce((s, i) => s + (arr[i] || 0), 0); }

// Share of vacancies (in %) for a count series in the selected domain.
function shareSeries(counts, domain) {
  const v = D.vacancies[domain];
  return counts.map((n, i) => (v[i] ? (100 * n) / v[i] : null));
}
function periodShare(counts, domain, idx) {
  const v = sumAt(D.vacancies[domain], idx);
  return v ? (100 * sumAt(counts, idx)) / v : null;
}

function classify(early, recent, earlyN, recentN, domain) {
  const minN = domain === 'ALL' ? D.meta.min_vacancies : D.meta.min_vacancies_domain;
  if (Math.max(earlyN, recentN) < minN) return 'low';
  const f = D.meta.change_factor;
  if (early === 0) return recent > 0 ? 'up' : 'stable';
  const ratio = recent / early;
  if (ratio >= f) return 'up';
  if (ratio <= 1 / f) return 'down';
  return 'stable';
}

// All skills of the selected group and domain, with their period shares.
function skillRows() {
  const counts = D.skill_counts[state.domain] || {};
  const eIdx = yearIndex(D.meta.early_years);
  const rIdx = yearIndex(D.meta.recent_years);
  const rows = [];
  for (const id in counts) {
    const [name, g, subgroup] = D.skills[id];
    if (state.group >= 0 && g !== state.group) continue;
    const c = counts[id];
    const early = periodShare(c, state.domain, eIdx);
    const recent = periodShare(c, state.domain, rIdx);
    const earlyN = sumAt(c, eIdx);
    const recentN = sumAt(c, rIdx);
    const ratio = early > 0 ? recent / early : null;
    rows.push({ id: Number(id), name, g, subgroup, early, recent, earlyN, recentN, ratio,
      cls: classify(early, recent, earlyN, recentN, state.domain), series: shareSeries(c, state.domain) });
  }
  return rows;
}

function sortedRows(rows) {
  if (state.sort === 'top') return rows.sort((a, b) => b.recent - a.recent);
  const eligible = rows.filter((r) => r.cls !== 'low');
  if (state.sort === 'growing') return eligible.filter((r) => r.recent > r.early).sort((a, b) => (b.recent - b.early) - (a.recent - a.early));
  return eligible.filter((r) => r.recent < r.early).sort((a, b) => (a.recent - a.early) - (b.recent - b.early));
}

// ---------- rendering ----------
function renderPills() {
  const el = $('group-pills');
  const items = [{ i: -1, name: 'All groups' }].concat(D.groups.map((name, i) => ({ i, name })));
  el.innerHTML = items.map((it) => `<button class="pill" role="radio" aria-checked="${it.i === state.group}" data-group="${it.i}">` +
    (it.i >= 0 ? `<span class="dot" style="background:${GROUP_COLORS[it.i]}"></span>` : '') + `${escapeHtml(it.name)}</button>`).join('');
  el.querySelectorAll('.pill').forEach((b) => b.addEventListener('click', () => {
    state.group = Number(b.dataset.group); state.limit = 20; resetCompare(); renderAll();
  }));
}

function renderDomainSelect() {
  const sel = $('domain-select');
  sel.innerHTML = D.domains.map((d) => `<option value="${d.code}">${escapeHtml(d.code === 'ALL' ? d.name : d.code + ' · ' + d.name)}</option>`).join('');
  sel.value = state.domain;
  sel.addEventListener('change', () => { state.domain = sel.value; state.limit = 20; resetCompare(); renderAll(); });
}

function lastFullYearIndex() {
  const ys = D.meta.years;
  let i = ys.length - 1;
  if (ys[i] === D.meta.partial_year) i -= 1;
  return i;
}

function renderKpis(rows) {
  const i = lastFullYearIndex();
  const year = D.meta.years[i];
  const vac = D.vacancies[state.domain];
  const eIdx = yearIndex(D.meta.early_years), rIdx = yearIndex(D.meta.recent_years);
  const cards = [];
  cards.push({ label: `Vacancies with skills, ${year}`, value: fmtInt(vac[i]), sub: domainName() });

  if (state.group < 0) {
    const shares = D.groups.map((g, k) => ({ g, k, s: shareSeries(D.group_counts[state.domain][k], state.domain)[i],
      e: periodShare(D.group_counts[state.domain][k], state.domain, eIdx), r: periodShare(D.group_counts[state.domain][k], state.domain, rIdx) }));
    const top = shares.slice().sort((a, b) => b.s - a.s)[0];
    const grow = shares.filter((x) => x.e > 0).sort((a, b) => (b.r - b.e) - (a.r - a.e))[0];
    cards.push({ label: `Most asked group, ${year}`, value: top.g, small: true, sub: `${fmtPct(top.s)} of vacancies` });
    cards.push({ label: 'Biggest gain, 2017–19 → 2023–25', value: grow.g, small: true, sub: `${signed(grow.r - grow.e)} points` });
  } else {
    const c = D.group_counts[state.domain][state.group];
    const s = shareSeries(c, state.domain)[i];
    const e = periodShare(c, state.domain, eIdx), r = periodShare(c, state.domain, rIdx);
    cards.push({ label: `Ask for ${D.groups[state.group]}, ${year}`, value: fmtPct(s), sub: 'of vacancies with skills' });
    cards.push({ label: 'Change, 2017–19 → 2023–25', value: `${signed(r - e)} pts`, sub: `${fmtPct(e)} → ${fmtPct(r)}` });
  }
  const growing = rows.filter((r) => r.cls !== 'low' && r.recent > r.early).sort((a, b) => (b.recent - b.early) - (a.recent - a.early))[0];
  cards.push(growing
    ? { label: 'Skill with the biggest gain', value: growing.name, small: true, sub: `${fmtPct(growing.early)} → ${fmtPct(growing.recent)} of vacancies` }
    : { label: 'Skill with the biggest gain', value: '–', sub: 'Not enough ads' });

  $('kpis').innerHTML = cards.map((c) => `<div class="kpi"><div class="kpi-label">${escapeHtml(c.label)}</div>` +
    `<div class="kpi-value${c.small ? ' small' : ''}">${escapeHtml(c.value)}</div><div class="kpi-sub">${escapeHtml(c.sub)}</div></div>`).join('');
}

function signed(x) { return x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1); }
function domainName() { return D.domains.find((d) => d.code === state.domain).name; }

// Dashed line for the incomplete last year.
function partialSegment(ctx) {
  const ys = D.meta.years;
  return ys[ctx.p1DataIndex] === D.meta.partial_year ? [5, 4] : undefined;
}

function lineOptions(yTitle) {
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { family: 'General Sans', size: 12 } } },
      tooltip: {
        itemSort: (a, b) => b.parsed.y - a.parsed.y,
        callbacks: {
          title: (items) => { const y = items[0].label; return Number(y) === D.meta.partial_year ? `${y} (${D.meta.partial_note})` : y; },
          label: (it) => ` ${it.dataset.label}: ${fmtPct(it.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: 'General Sans', size: 12 } } },
      y: { beginAtZero: true, title: { display: true, text: yTitle, font: { family: 'General Sans', size: 12 } },
        ticks: { callback: (v) => v + '%', font: { family: 'General Sans', size: 12 } }, grid: { color: '#e6e9ed' } },
    },
  };
}

function renderGroupChart() {
  const datasets = D.groups.map((g, k) => {
    const on = state.group < 0 || state.group === k;
    const color = on ? GROUP_COLORS[k] : '#c9ced4';
    return { label: g, data: shareSeries(D.group_counts[state.domain][k], state.domain), borderColor: color, backgroundColor: color,
      borderWidth: state.group === k ? 3 : 2, pointRadius: on ? 2.5 : 0, tension: 0.25, order: on ? 0 : 1,
      segment: { borderDash: partialSegment } };
  });
  $('group-chart-title').textContent = state.group < 0
    ? 'Share of vacancies asking for each skill group'
    : `Share of vacancies asking for ${D.groups[state.group]}`;
  const cfg = { type: 'line', data: { labels: D.meta.years, datasets }, options: lineOptions('Percentage of vacancies') };
  if (groupChart) { groupChart.data = cfg.data; groupChart.update(); }
  else groupChart = new Chart($('group-chart'), cfg);
}

function sparkline(series) {
  const vals = series.map((v) => (v == null ? 0 : v));
  const max = Math.max(...vals, 0.0001);
  const w = 84, h = 24, n = vals.length;
  const pts = vals.map((v, i) => `${((i / (n - 1)) * (w - 4) + 2).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`);
  const full = pts.slice(0, n - 1).join(' ');
  const last = pts.slice(n - 2).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${full}" fill="none" stroke="#0a6b94" stroke-width="1.6"/>` +
    `<polyline points="${last}" fill="none" stroke="#0a6b94" stroke-width="1.6" stroke-dasharray="3 2"/></svg>`;
}

function tagFor(cls) {
  return { up: '<em class="tag up">Growing</em>', down: '<em class="tag down">Declining</em>', low: '<em class="tag low">Few ads</em>', stable: '<em class="tag stable">Stable</em>' }[cls];
}

function renderTable(rows) {
  const list = sortedRows(rows);
  const shown = list.slice(0, state.limit);
  const groupTxt = state.group < 0 ? 'all groups' : D.groups[state.group];
  $('table-title').textContent = { top: 'Top skills', growing: 'Growing skills', declining: 'Declining skills' }[state.sort] + ' · ' + groupTxt;
  const minN = state.domain === 'ALL' ? D.meta.min_vacancies : D.meta.min_vacancies_domain;
  $('table-note').textContent = state.sort === 'top'
    ? `${domainName()} · ranked by share of vacancies in 2023–25`
    : `${domainName()} · ranked by change in percentage points since 2017–19 · skills in fewer than ${minN} ads in both periods are left out`;
  const body = $('skills-body');
  if (!shown.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty">No skills match this filter.</td></tr>`;
  } else {
    body.innerHTML = shown.map((r, k) => {
      const pts = r.recent - r.early;
      const ratioTxt = `${signed(pts)} pts`;
      const ratioTitle = r.ratio == null ? 'new skill' : `×${r.ratio.toFixed(2)} of its 2017–19 share`;
      const dcls = pts >= 0.5 ? 'up' : pts <= -0.5 ? 'down' : 'flat';
      const arrow = dcls === 'up' ? '▲' : dcls === 'down' ? '▼' : '■';
      return `<tr data-id="${r.id}" class="${state.compare.includes(r.id) ? 'selected' : ''}" tabindex="0">` +
        `<td class="num hide-sm">${k + 1}</td>` +
        `<td><span class="skill-name"><span class="dot" style="background:${GROUP_COLORS[r.g]}" title="${escapeHtml(D.groups[r.g])}"></span>${escapeHtml(r.name)}</span></td>` +
        `<td class="hide-sm subgroup">${escapeHtml(r.subgroup)}</td>` +
        `<td class="num hide-xs">${fmtPct(r.early)}</td><td class="num"><strong>${fmtPct(r.recent)}</strong></td>` +
        `<td class="num delta ${dcls}" title="${ratioTitle}"><span aria-hidden="true">${arrow}</span> ${ratioTxt}</td>` +
        `<td class="hide-sm">${sparkline(r.series)}</td><td class="hide-sm">${tagFor(r.cls)}</td></tr>`;
    }).join('');
  }
  body.querySelectorAll('tr[data-id]').forEach((tr) => {
    const toggle = () => toggleCompare(Number(tr.dataset.id));
    tr.addEventListener('click', toggle);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
  const more = $('more-btn');
  more.hidden = list.length <= state.limit;
  more.textContent = state.limit >= 50 ? `Show all ${list.length}` : 'Show more';
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.sort === state.sort)));
}

function resetCompare() {
  const rows = skillRows().sort((a, b) => b.recent - a.recent);
  state.compare = rows.slice(0, 5).map((r) => r.id);
}

function toggleCompare(id) {
  const i = state.compare.indexOf(id);
  if (i >= 0) state.compare.splice(i, 1);
  else { if (state.compare.length >= MAX_COMPARE) state.compare.shift(); state.compare.push(id); }
  renderTable(skillRows());
  renderSkillChart();
}

function renderSkillChart() {
  const counts = D.skill_counts[state.domain] || {};
  const datasets = state.compare.filter((id) => counts[id]).map((id, k) => {
    const color = SKILL_COLORS[k % SKILL_COLORS.length];
    return { label: D.skills[id][0], data: shareSeries(counts[id], state.domain), borderColor: color, backgroundColor: color,
      borderWidth: 2, pointRadius: 2.5, tension: 0.25, segment: { borderDash: partialSegment } };
  });
  $('chips').innerHTML = datasets.length
    ? state.compare.filter((id) => counts[id]).map((id, k) => `<button class="chip" data-id="${id}" aria-label="Remove ${escapeHtml(D.skills[id][0])}">` +
      `<span class="dot" style="background:${SKILL_COLORS[k % SKILL_COLORS.length]}"></span>${escapeHtml(D.skills[id][0])}<span class="x" aria-hidden="true">×</span></button>`).join('')
    : '<span class="note">No skill selected. Click a skill in the table or search for one.</span>';
  $('chips').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => toggleCompare(Number(b.dataset.id))));
  const cfg = { type: 'line', data: { labels: D.meta.years, datasets }, options: lineOptions('Percentage of vacancies') };
  if (skillChart) { skillChart.data = cfg.data; skillChart.update(); }
  else skillChart = new Chart($('skill-chart'), cfg);
}

function renderSearchOptions() {
  const counts = D.skill_counts[state.domain] || {};
  const ids = Object.keys(counts).sort((a, b) => Number(a) - Number(b));
  $('skill-options').innerHTML = ids.map((id) => `<option value="${escapeHtml(D.skills[id][0])}"></option>`).join('');
}

function setupSearch() {
  const input = $('skill-search');
  const tryAdd = () => {
    const name = input.value.trim().toLowerCase();
    if (!name) return;
    const counts = D.skill_counts[state.domain] || {};
    const id = Object.keys(counts).find((k) => D.skills[k][0].toLowerCase() === name);
    if (id != null) {
      if (!state.compare.includes(Number(id))) toggleCompare(Number(id));
      input.value = '';
    }
  };
  input.addEventListener('change', tryAdd);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryAdd(); });
}

function renderAll() {
  const rows = skillRows();
  renderPills();
  renderKpis(rows);
  renderGroupChart();
  renderTable(rows);
  renderSkillChart();
  renderSearchOptions();
}

async function init() {
  try {
    const res = await fetch('data/dashboard.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    D = await res.json();
  } catch (err) {
    const s = $('status');
    s.textContent = 'Could not load data/dashboard.json. Run notebook 06, then open the site through a web server (see the notebook).';
    s.classList.add('error');
    return;
  }
  $('status').textContent = '';
  const ey = D.meta.early_years, ry = D.meta.recent_years;
  $('th-early').textContent = `${ey[0]}–${String(ey[ey.length - 1]).slice(2)}`;
  $('th-recent').textContent = `${ry[0]}–${String(ry[ry.length - 1]).slice(2)}`;
  $('partial-note').textContent = `${D.meta.partial_year}: ${D.meta.partial_note} (dashed).`;
  $('source-note').textContent = `Source: ${D.meta.source}. Data prepared on ${D.meta.generated}.`;
  renderDomainSelect();
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { state.sort = b.dataset.sort; state.limit = 20; renderTable(skillRows()); }));
  $('more-btn').addEventListener('click', () => { state.limit = state.limit >= 50 ? 100000 : 50; renderTable(skillRows()); });
  setupSearch();
  resetCompare();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);

'use strict';

// ── State ─────────────────────────────────────────────────────────────────
let allResults    = [];
let currentFilter = 'all';
let sortMode      = 'priority';
let chartInstance = null;
let parsedCustomers = [];
let originalProbability  = 0;
let originalClusterId    = null;
let currentPanelCustomer = null;
let recalcTimer          = null;

// ── Cluster Labels (mirror of app.py CLUSTER_LABELS) ─────────────────────
const CLUSTER_LABELS = {
  0: { name: '장기 저비용 안정군',    color: 'green'  },
  1: { name: '단기 고비용 이탈위험군', color: 'red'    },
  2: { name: '장기 고비용 우량군',    color: 'blue'   },
  3: { name: '신규 저비용 관찰군',    color: 'orange' },
};

// ── Risk Bands ────────────────────────────────────────────────────────────
// 고위험/저위험 2분할만으로는 "0.51과 0.99가 같은 칸"에 들어가 우선순위를
// 판단할 수 없다. 확률을 5개 구간으로 쪼개 분포의 모양을 드러낸다.
const RISK_BANDS = [
  { key: 'b80', label: '80–100%', min: 0.8, max: 1.01, color: '#B91C1C' },
  { key: 'b60', label: '60–80%',  min: 0.6, max: 0.8,  color: '#E24B4A' },
  { key: 'b40', label: '40–60%',  min: 0.4, max: 0.6,  color: '#E89B3C' },
  { key: 'b20', label: '20–40%',  min: 0.2, max: 0.4,  color: '#7FB069' },
  { key: 'b00', label: '0–20%',   min: 0,   max: 0.2,  color: '#3B9E5F' },
];

// ── Sample Dataset ────────────────────────────────────────────────────────
// 처음 방문한 사람이 CSV를 만들지 않고도 대시보드 전체를 볼 수 있어야 한다.
// [tenure, MonthlyCharges, paymentIdx, OnlineSecurity, TechSupport,
//  StreamingTV, StreamingMovies, SeniorCitizen]
const PAYMENTS = [
  'Electronic check', 'Mailed check',
  'Bank transfer (automatic)', 'Credit card (automatic)',
];

const SAMPLE_ROWS = [
  [1, 85.2, 0, 0, 0, 1, 1, 0], [2, 94.4, 0, 0, 0, 1, 1, 1],
  [3, 79.9, 0, 0, 0, 1, 0, 0], [4, 99.1, 0, 0, 0, 1, 1, 1],
  [5, 74.4, 0, 0, 0, 0, 1, 0], [6, 88.6, 0, 0, 1, 1, 1, 0],
  [8, 70.5, 0, 0, 0, 1, 0, 0], [9, 103.7, 0, 0, 0, 1, 1, 1],
  [11, 65.3, 0, 0, 0, 0, 0, 0], [12, 80.1, 0, 0, 1, 1, 0, 0],
  [14, 95.8, 0, 1, 0, 1, 1, 0], [16, 61.2, 1, 0, 0, 0, 1, 0],
  [18, 76.4, 0, 0, 1, 1, 1, 1], [20, 55.0, 1, 0, 0, 0, 0, 0],
  [22, 89.3, 2, 0, 0, 1, 1, 0], [24, 68.7, 0, 1, 1, 0, 1, 0],
  [26, 49.9, 1, 1, 0, 0, 0, 0], [28, 84.5, 3, 0, 1, 1, 1, 0],
  [30, 58.4, 2, 1, 1, 0, 0, 0], [33, 92.0, 0, 1, 1, 1, 1, 1],
  [36, 45.2, 2, 1, 1, 0, 0, 0], [38, 73.8, 3, 1, 0, 1, 1, 0],
  [41, 39.7, 1, 1, 1, 0, 0, 0], [43, 99.6, 2, 1, 1, 1, 1, 0],
  [45, 52.3, 3, 1, 1, 0, 1, 0], [48, 45.0, 2, 1, 1, 0, 0, 0],
  [50, 105.2, 3, 1, 1, 1, 1, 0], [52, 34.8, 2, 1, 1, 0, 0, 0],
  [55, 66.1, 3, 1, 1, 1, 0, 0], [57, 110.4, 2, 1, 1, 1, 1, 1],
  [59, 29.9, 1, 1, 1, 0, 0, 0], [61, 94.7, 3, 1, 1, 1, 1, 0],
  [63, 41.5, 2, 1, 1, 0, 0, 0], [66, 88.2, 3, 1, 1, 1, 1, 0],
  [68, 25.4, 2, 1, 1, 0, 0, 0], [70, 101.9, 3, 1, 1, 1, 1, 0],
  [71, 36.6, 2, 1, 1, 0, 0, 0], [72, 118.3, 3, 1, 1, 1, 1, 0],
  [7, 91.5, 0, 0, 0, 1, 1, 1], [15, 82.7, 0, 0, 0, 1, 1, 0],
];

const YN = v => (v ? 'Yes' : 'No');

function buildSampleCustomers() {
  return SAMPLE_ROWS.map(([tenure, monthly, pay, sec, tech, tv, mv, senior], i) => {
    // 누적 요금은 가입 기간 동안 요금제가 조금씩 오른 것처럼 근사한다.
    const total = Math.round(tenure * monthly * 0.97 * 100) / 100;
    return {
      customer_id:       'C' + String(i + 1).padStart(3, '0'),
      tenure,
      MonthlyCharges:    monthly,
      TotalCharges:      total,
      avg_monthly_spend: tenure > 0 ? total / tenure : 0,
      PaymentMethod:     PAYMENTS[pay],
      OnlineSecurity:    YN(sec),
      TechSupport:       YN(tech),
      StreamingTV:       YN(tv),
      StreamingMovies:   YN(mv),
      SeniorCitizen:     senior,
    };
  });
}

// ── Formatters ────────────────────────────────────────────────────────────
const fmtMoney = n =>
  '$' + Math.round(n).toLocaleString('en-US');

const fmtPct = n => (n * 100).toFixed(1) + '%';

// 이 고객이 이탈할 경우 매달 잃는 금액의 기댓값.
// 운영진의 우선순위는 확률이 아니라 이 값으로 정해져야 한다.
const expectedLoss = r => (r.churn_probability || 0) * (r.MonthlyCharges || 0);

// ── Icons ─────────────────────────────────────────────────────────────────
const ICONS = {
  gift: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  star: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initDropZone();
  initTemplateDownload();
  initManualForm();
  initFilters();
  initBatchButton();
  initWhatIfPanel();
  initSampleData();
  warmUpApi();
});

// ── Warm-up ───────────────────────────────────────────────────────────────
// 예측 서버(무료 플랜)는 미사용 시 슬립한다. 페이지 로드 시 한 번 깨워두면
// 사용자가 실제로 예측을 누를 때쯤엔 콜드 스타트가 끝나 있다.
function warmUpApi() {
  fetch('/api/health').catch(() => { /* 워밍업 실패는 무시 */ });
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-panel`).classList.add('active');
    });
  });
}

// ── Drop Zone ─────────────────────────────────────────────────────────────
function initDropZone() {
  const zone  = document.getElementById('drop-zone');
  const input = document.getElementById('file-input');

  document.getElementById('upload-btn').addEventListener('click', e => {
    e.stopPropagation();
    input.click();
  });

  input.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  zone.addEventListener('click', () => input.click());
}

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showError('CSV 파일만 업로드 가능합니다.');
    return;
  }
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: ({ data }) => {
      parsedCustomers = data.map(row => {
        const tenure = Number(row.tenure) || 0;
        const total  = Number(row.TotalCharges) || 0;
        return {
          customer_id:       row.customer_id || '',
          tenure,
          MonthlyCharges:    Number(row.MonthlyCharges) || 0,
          TotalCharges:      total,
          avg_monthly_spend: tenure > 0 ? total / tenure : 0,
          PaymentMethod:     row.PaymentMethod   || '',
          OnlineSecurity:    row.OnlineSecurity  || 'No',
          TechSupport:       row.TechSupport     || 'No',
          StreamingTV:       row.StreamingTV     || 'No',
          StreamingMovies:   row.StreamingMovies || 'No',
          SeniorCitizen:     Number(row.SeniorCitizen) || 0,
        };
      });

      const info = document.getElementById('file-info');
      info.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${file.name} — <strong>${parsedCustomers.length}명</strong> 로드됨`;
      info.classList.remove('hidden');
      document.getElementById('batch-predict-btn').classList.remove('hidden');
      clearError();
    },
    error: () => showError('CSV 파싱 중 오류가 발생했습니다.'),
  });
}

// ── Template Download ─────────────────────────────────────────────────────
function initTemplateDownload() {
  document.getElementById('template-download').addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const rows = [
      'customer_id,tenure,MonthlyCharges,TotalCharges,PaymentMethod,OnlineSecurity,TechSupport,StreamingTV,StreamingMovies,SeniorCitizen',
      'C001,12,70.5,846.0,Electronic check,No,No,Yes,No,0',
      'C002,48,45.0,2160.0,Bank transfer (automatic),Yes,Yes,No,No,0',
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'churn_template.csv' });
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ── Batch Button ──────────────────────────────────────────────────────────
function initBatchButton() {
  document.getElementById('batch-predict-btn').addEventListener('click', () => {
    if (parsedCustomers.length) runBatchPredict(parsedCustomers);
  });
}

async function runBatchPredict(customers) {
  showLoading(true);
  try {
    const res = await fetch('/api/predict-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customers }),
    });
    if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
    const { results, summary } = await res.json();
    results.forEach((r, i) => {
      r.tenure         = customers[i].tenure;
      r.MonthlyCharges = customers[i].MonthlyCharges;
      r.TotalCharges   = customers[i].TotalCharges;
      r.OnlineSecurity = customers[i].OnlineSecurity;
      r.PaymentMethod  = customers[i].PaymentMethod;
    });
    renderResults(results, summary);
  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

// ── Manual Form ───────────────────────────────────────────────────────────
function initManualForm() {
  document.getElementById('manual-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd     = new FormData(e.target);
    const tenure = Number(fd.get('tenure'))       || 0;
    const total  = Number(fd.get('TotalCharges')) || 0;

    const customer = {
      customer_id:       fd.get('customer_id') || 'C001',
      tenure,
      MonthlyCharges:    Number(fd.get('MonthlyCharges')) || 0,
      TotalCharges:      total,
      avg_monthly_spend: tenure > 0 ? total / tenure : 0,
      PaymentMethod:     fd.get('PaymentMethod'),
      OnlineSecurity:    fd.get('OnlineSecurity'),
      TechSupport:       fd.get('TechSupport'),
      StreamingTV:       fd.get('StreamingTV'),
      StreamingMovies:   fd.get('StreamingMovies'),
      SeniorCitizen:     Number(fd.get('SeniorCitizen')),
    };

    showLoading(true);
    try {
      const res = await fetch('/api/predict-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customer),
      });
      if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
      const result = await res.json();
      result.tenure         = customer.tenure;
      result.MonthlyCharges = customer.MonthlyCharges;
      result.TotalCharges   = customer.TotalCharges;
      result.OnlineSecurity = customer.OnlineSecurity;
      result.PaymentMethod  = customer.PaymentMethod;
      renderResults([result], {
        total:     1,
        high_risk: result.risk_level === 'high' ? 1 : 0,
        low_risk:  result.risk_level === 'low'  ? 1 : 0,
      });
    } catch (err) {
      showError(err.message);
    } finally {
      showLoading(false);
    }
  });
}

// ── Render Results ────────────────────────────────────────────────────────
function renderResults(results, summary) {
  allResults    = [...results].sort((a, b) => b.churn_probability - a.churn_probability);
  currentFilter = 'all';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));

  updateKPICards(summary, results);
  renderChart(results);
  renderClusterPanel(results);
  renderEventCards(results);
  renderTable();
  clearError();
}

// ── KPI Cards ─────────────────────────────────────────────────────────────
// 숫자 하나만 있는 카드는 "그래서 어쩌라고"로 끝난다. 각 카드에 비교값(비중,
// 중앙값, 최악 시나리오)을 함께 실어 판단에 필요한 맥락을 준다.
function updateKPICards(summary, results) {
  const n = results.length;
  setText('kpi-total', summary.total);
  setText('kpi-total-sub', n ? `예측 완료 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '—');

  // 고위험 고객 수 + 전체 대비 비중
  const highShare = n ? summary.high_risk / n : 0;
  setText('kpi-high', summary.high_risk);
  setText('kpi-high-sub', n ? `전체의 ${fmtPct(highShare)}` : '—');
  const bar = document.getElementById('kpi-high-bar');
  if (bar) bar.style.width = (highShare * 100).toFixed(1) + '%';

  // 위험 매출 — Σ(이탈확률 × 월요금). 확률을 금액으로 번역한 값이라
  // "누구부터 붙잡을지"를 정할 수 있는 유일한 지표다.
  const atRisk = results.reduce((sum, r) => sum + expectedLoss(r), 0);
  const worstCase = results
    .filter(r => r.risk_level === 'high')
    .reduce((sum, r) => sum + (r.MonthlyCharges || 0), 0);
  setText('kpi-revenue', n ? fmtMoney(atRisk) : '—');
  setText('kpi-revenue-sub', n ? `고위험군 전원 이탈 시 ${fmtMoney(worstCase)}` : '—');

  // 평균 + 중앙값 — 평균만 보면 소수의 극단값에 끌려간다.
  const probs = results.map(r => r.churn_probability).sort((a, b) => a - b);
  const avg = n ? probs.reduce((a, b) => a + b, 0) / n : 0;
  const median = n
    ? (n % 2 ? probs[(n - 1) / 2] : (probs[n / 2 - 1] + probs[n / 2]) / 2)
    : 0;
  setText('kpi-avg', n ? fmtPct(avg) : '—');
  setText('kpi-avg-sub', n ? `중앙값 ${fmtPct(median)}` : '—');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  // 자리표시자 '—'가 본문과 같은 굵기로 남으면 로딩 바처럼 읽힌다.
  el.classList.toggle('is-empty', value === '—');
}

// ── Chart: 위험도 구간 분포 ───────────────────────────────────────────────
// 2조각 도넛(고/저위험)은 KPI 카드가 이미 말한 것을 반복할 뿐이었다.
// 구간별 막대는 "위험이 어디에 몰려 있는가"를 보여줘 개입 기준선을 정하게 한다.
function renderChart(results) {
  document.getElementById('chart-empty').classList.add('hidden');
  document.getElementById('chart-wrap').classList.remove('hidden');

  const counts = RISK_BANDS.map(b =>
    results.filter(r => r.churn_probability >= b.min && r.churn_probability < b.max).length
  );

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(document.getElementById('risk-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: RISK_BANDS.map(b => b.label),
      datasets: [{
        data: counts,
        backgroundColor: RISK_BANDS.map(b => b.color),
        borderRadius: 4,
        borderSkipped: false,
        barThickness: 18,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 8 } },
      scales: {
        x: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#F3F4F6' },
          ticks: { precision: 0, color: '#9CA3AF', font: { size: 11 } },
        },
        y: {
          border: { display: false },
          grid: { display: false },
          ticks: {
            color: '#6B7280',
            font: { family: "'Pretendard Variable', system-ui", size: 11 },
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = total ? ((ctx.parsed.x / total) * 100).toFixed(1) : 0;
              return ` ${ctx.parsed.x}명 (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ── Cluster Composition ───────────────────────────────────────────────────
// kmeans 결과는 이미 API가 돌려주고 있었지만 테이블 뱃지로만 쓰였다.
// 군집 구성은 "이 명단이 어떤 성격의 고객으로 이뤄져 있나"를 한 눈에 준다.
const CLUSTER_HEX = { green: '#3B9E5F', red: '#E24B4A', blue: '#2563EB', orange: '#E89B3C', gray: '#9CA3AF' };

function renderClusterPanel(results) {
  const host = document.getElementById('cluster-panel');
  if (!host) return;

  const groups = new Map();
  results.forEach(r => {
    const id = r.cluster_id ?? -1;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        name:  r.cluster_name || '미분류',
        desc:  r.cluster_description || '',
        color: CLUSTER_HEX[r.cluster_color] || CLUSTER_HEX.gray,
        count: 0,
        loss:  0,
      });
    }
    const g = groups.get(id);
    g.count += 1;
    g.loss  += expectedLoss(r);
  });

  const rows = [...groups.values()].sort((a, b) => b.loss - a.loss);
  const total = results.length || 1;

  host.innerHTML = rows.map(g => `
    <div class="cl-row" title="${escapeAttr(g.desc)}">
      <div class="cl-top">
        <span class="cl-dot" style="background:${g.color}"></span>
        <span class="cl-name">${escapeHtml(g.name)}</span>
        <span class="cl-count">${g.count}명</span>
      </div>
      <div class="cl-track">
        <div class="cl-fill" style="width:${(g.count / total * 100).toFixed(1)}%;background:${g.color}"></div>
      </div>
      <div class="cl-loss">위험 매출 ${fmtMoney(g.loss)}<span class="cl-unit">/월</span></div>
    </div>`).join('');

  document.getElementById('cluster-card').classList.remove('hidden');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const escapeAttr = escapeHtml;

// ── Event Cards ───────────────────────────────────────────────────────────
function renderEventCards(results) {
  const seen  = new Set();
  const cards = results
    .map(r => r.recommended_event ? { ...r.recommended_event } : null)
    .filter(e => e && !seen.has(e.type) && seen.add(e.type));

  document.getElementById('event-section').classList.toggle('hidden', cards.length === 0);
  document.getElementById('event-cards').innerHTML = cards.map(ev => {
    const isHigh = ev.badge_color === 'red';
    return `
      <div class="event-card ${isHigh ? 'ec-high' : 'ec-low'}">
        <div class="ec-icon">${ICONS[ev.icon] || ICONS.star}</div>
        <div class="ec-body">
          <div class="ec-title">${ev.title}</div>
          <div class="ec-desc">${ev.description}</div>
          <div class="ec-trigger">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${ev.trigger_condition}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Cluster Badge ─────────────────────────────────────────────────────────
function renderClusterBadge(result) {
  if (!result.cluster_name) {
    return '<span class="badge badge-cluster-gray">—</span>';
  }
  const color = result.cluster_color || 'gray';
  const desc  = result.cluster_description ? ` title="${result.cluster_description}"` : '';
  return `<span class="badge badge-cluster-${color}"${desc}>${result.cluster_name}</span>`;
}

// ── Table ─────────────────────────────────────────────────────────────────
function initFilters() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn || !btn.dataset.filter) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTable();
  });

  const sortSel = document.getElementById('sort-mode');
  if (sortSel) sortSel.addEventListener('change', () => {
    sortMode = sortSel.value;
    renderTable();
  });
}

// 확률만으로 줄을 세우면 "95% × $20"이 "62% × $110"보다 위로 온다.
// 운영진이 실제로 먼저 연락해야 하는 쪽은 후자다.
function sortedResults() {
  const rows = [...allResults];
  if (sortMode === 'probability') return rows.sort((a, b) => b.churn_probability - a.churn_probability);
  if (sortMode === 'value')       return rows.sort((a, b) => (b.MonthlyCharges || 0) - (a.MonthlyCharges || 0));
  return rows.sort((a, b) => expectedLoss(b) - expectedLoss(a));
}

function renderTable() {
  if (allResults.length === 0) {
    document.getElementById('table-empty').classList.remove('hidden');
    document.getElementById('ctable').classList.add('hidden');
    return;
  }

  document.getElementById('table-empty').classList.add('hidden');
  document.getElementById('ctable').classList.remove('hidden');

  const rows = sortedResults()
    .filter(r => currentFilter === 'all' || r.risk_level === currentFilter);

  const maxLoss = Math.max(...allResults.map(expectedLoss), 1);

  document.getElementById('table-body').innerHTML = rows.map((r, rowIdx) => {
    const pct     = (r.churn_probability * 100).toFixed(1);
    const isHigh  = r.risk_level === 'high';
    const loss    = expectedLoss(r);
    const factors = r.key_risk_factors?.length
      ? r.key_risk_factors.map(f => `<span class="ftag">${escapeHtml(f)}</span>`).join('')
      : '<span class="no-data">—</span>';

    const evTitle = r.recommended_event?.title || '—';
    const evDesc  = r.recommended_event?.description ? ` title="${escapeAttr(r.recommended_event.description)}"` : '';
    const origIdx = allResults.indexOf(r);

    return `
      <tr data-index="${origIdx}" style="animation-delay:${Math.min(rowIdx, 20) * 25}ms">
        <td><span class="rank">${rowIdx + 1}</span></td>
        <td><span class="cid">${escapeHtml(r.customer_id || '—')}</span></td>
        <td>
          <div class="prob-cell">
            <span class="prob-text">${pct}%</span>
            <div class="prob-bar">
              <div class="prob-bar-fill ${isHigh ? 'high' : 'low'}" style="width:${pct}%"></div>
            </div>
          </div>
        </td>
        <td>
          <div class="loss-cell">
            <span class="loss-text">${fmtMoney(loss)}</span>
            <div class="loss-bar"><div class="loss-bar-fill" style="width:${(loss / maxLoss * 100).toFixed(1)}%"></div></div>
          </div>
        </td>
        <td><span class="badge ${isHigh ? 'badge-high' : 'badge-low'}">${isHigh ? '고위험' : '저위험'}</span></td>
        <td>${renderClusterBadge(r)}</td>
        <td class="td-factors">${factors}</td>
        <td><span class="ev-name ${isHigh ? 'ev-high' : 'ev-low'}"${evDesc}>${escapeHtml(evTitle)}</span></td>
        <td class="td-open"><span class="open-hint">시뮬레이션 ›</span></td>
      </tr>`;
  }).join('');

  const counter = document.getElementById('table-count');
  if (counter) counter.textContent = `${rows.length}명`;
}

// ── Sample Data ───────────────────────────────────────────────────────────
function initSampleData() {
  document.querySelectorAll('[data-sample]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      runBatchPredict(buildSampleCustomers());
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function showLoading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${msg}`;
  el.classList.remove('hidden');
}

function clearError() {
  document.getElementById('error-msg').classList.add('hidden');
}

// ── What-if Panel ─────────────────────────────────────────────────────────
function initWhatIfPanel() {
  document.getElementById('wif-close').addEventListener('click', closeWhatIfPanel);
  document.getElementById('whatif-overlay').addEventListener('click', closeWhatIfPanel);

  const tenureSlider  = document.getElementById('wif-tenure');
  const monthlySlider = document.getElementById('wif-monthly');

  tenureSlider.addEventListener('input', () => {
    document.getElementById('wif-tenure-val').textContent = tenureSlider.value;
    scheduleRecalc();
  });

  monthlySlider.addEventListener('input', () => {
    document.getElementById('wif-monthly-val').textContent = monthlySlider.value;
    scheduleRecalc();
  });

  document.getElementById('wif-contract').addEventListener('change', recalculate);
  document.getElementById('wif-payment').addEventListener('change', recalculate);
  document.getElementById('wif-security').addEventListener('change', recalculate);

  document.getElementById('table-body').addEventListener('click', e => {
    const row = e.target.closest('tr[data-index]');
    if (!row) return;
    openWhatIfPanel(allResults[parseInt(row.dataset.index)]);
  });
}

function openWhatIfPanel(result) {
  originalProbability   = result.churn_probability;
  originalClusterId     = result.cluster_id;
  currentPanelCustomer  = result;
  renderPanel(result);
  document.getElementById('whatif-overlay').classList.remove('hidden');
  document.getElementById('whatif-panel').classList.add('panel-open');
}

function closeWhatIfPanel() {
  document.getElementById('whatif-overlay').classList.add('hidden');
  document.getElementById('whatif-panel').classList.remove('panel-open');
}

function renderPanel(result) {
  document.getElementById('wif-customer-id').textContent  = result.customer_id || '—';
  document.getElementById('wif-cluster-name').textContent = result.cluster_name || '';

  const origEl = document.getElementById('wif-original-prob');
  origEl.textContent = (result.churn_probability * 100).toFixed(1) + '%';
  origEl.style.color = result.risk_level === 'high' ? 'var(--danger)' : 'var(--safe)';

  const tenure  = result.tenure         ?? 0;
  const monthly = result.MonthlyCharges ?? 70;

  const tenureSlider  = document.getElementById('wif-tenure');
  const monthlySlider = document.getElementById('wif-monthly');
  tenureSlider.value  = tenure;
  monthlySlider.value = monthly;
  document.getElementById('wif-tenure-val').textContent  = tenure;
  document.getElementById('wif-monthly-val').textContent = monthly;

  document.getElementById('wif-contract').value   = result.Contract || 'Month-to-month';
  document.getElementById('wif-security').checked = result.OnlineSecurity === 'Yes';
  document.getElementById('wif-payment').value    = result.PaymentMethod  || 'Electronic check';

  const adjEl = document.getElementById('wif-adjusted-prob');
  adjEl.textContent  = '—';
  adjEl.style.color  = '';
  const deltaEl = document.getElementById('wif-delta');
  deltaEl.textContent = '';
  deltaEl.className   = 'wif-delta';
  document.getElementById('wif-cluster-change').classList.add('hidden');
  document.getElementById('wif-action').innerHTML = '';
}

function scheduleRecalc() {
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(recalculate, 300);
}

async function recalculate() {
  if (!currentPanelCustomer) return;

  const tenure   = parseInt(document.getElementById('wif-tenure').value);
  const monthly  = parseFloat(document.getElementById('wif-monthly').value);
  const contract = document.getElementById('wif-contract').value;
  const security = document.getElementById('wif-security').checked ? 'Yes' : 'No';
  const payment  = document.getElementById('wif-payment').value;
  const total    = monthly * tenure;

  const payload = {
    ...currentPanelCustomer,
    tenure,
    MonthlyCharges:    monthly,
    TotalCharges:      total,
    avg_monthly_spend: tenure > 0 ? total / tenure : 0,
    Contract:          contract,
    OnlineSecurity:    security,
    PaymentMethod:     payment,
  };

  try {
    const res = await fetch('/api/predict-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return;
    const result = await res.json();
    updateProbabilityDisplay(result.churn_probability);
    updateActionDisplay(result.recommended_event);
    if (result.cluster_id !== originalClusterId) {
      showClusterChangeNotice(originalClusterId, result.cluster_id);
    } else {
      document.getElementById('wif-cluster-change').classList.add('hidden');
    }
  } catch { /* silent */ }
}

function updateProbabilityDisplay(newProb) {
  const el = document.getElementById('wif-adjusted-prob');
  el.textContent = (newProb * 100).toFixed(1) + '%';
  el.style.color  = newProb >= 0.5 ? 'var(--danger)' : 'var(--safe)';

  const delta   = newProb - originalProbability;
  const deltaEl = document.getElementById('wif-delta');
  if (Math.abs(delta) < 0.001) {
    deltaEl.textContent = '변화 없음';
    deltaEl.className   = 'wif-delta';
  } else if (delta < 0) {
    deltaEl.textContent = `▼ ${Math.abs(delta * 100).toFixed(1)}%p 감소`;
    deltaEl.className   = 'wif-delta delta-down';
  } else {
    deltaEl.textContent = `▲ ${(delta * 100).toFixed(1)}%p 증가`;
    deltaEl.className   = 'wif-delta delta-up';
  }
}

function updateActionDisplay(event) {
  if (!event) return;
  document.getElementById('wif-action').innerHTML = `
    <div class="wif-action-title">${event.title}</div>
    <div class="wif-action-desc">${event.description}</div>
    <div class="wif-action-trigger">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      ${event.trigger_condition}
    </div>`;
}

function showClusterChangeNotice(oldId, newId) {
  const el = document.getElementById('wif-cluster-change');
  el.textContent = `군집 변경: ${CLUSTER_LABELS[oldId]?.name || oldId} → ${CLUSTER_LABELS[newId]?.name || newId}`;
  el.classList.remove('hidden');
}

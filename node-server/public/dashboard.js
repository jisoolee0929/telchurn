'use strict';

// ── State ─────────────────────────────────────────────────────────────────
let allResults    = [];
let currentFilter = 'all';
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
});

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
  renderChart(summary);
  renderEventCards(results);
  renderTable();
  clearError();
}

// ── KPI Cards ─────────────────────────────────────────────────────────────
function updateKPICards(summary, results) {
  document.getElementById('kpi-total').textContent = summary.total;
  document.getElementById('kpi-high').textContent  = summary.high_risk;
  document.getElementById('kpi-low').textContent   = summary.low_risk;

  const avg = results.length
    ? (results.reduce((s, r) => s + r.churn_probability, 0) / results.length * 100).toFixed(1) + '%'
    : '—';
  document.getElementById('kpi-avg').textContent = avg;
}

// ── Chart ─────────────────────────────────────────────────────────────────
function renderChart({ high_risk, low_risk }) {
  document.getElementById('chart-empty').classList.add('hidden');
  document.getElementById('chart-wrap').classList.remove('hidden');

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(document.getElementById('risk-chart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['고위험', '저위험'],
      datasets: [{
        data: [high_risk, low_risk],
        backgroundColor: ['#E24B4A', '#3B9E5F'],
        borderColor:     'transparent',
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#6B7280',
            font: { family: "'Pretendard Variable', system-ui", size: 12 },
            padding: 20,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${ctx.parsed}명 (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ── Event Cards ───────────────────────────────────────────────────────────
function renderEventCards(results) {
  const seen  = new Set();
  const cards = results
    .map(r => r.recommended_event ? { ...r.recommended_event } : null)
    .filter(e => e && !seen.has(e.type) && seen.add(e.type));

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
}

function renderTable() {
  if (allResults.length === 0) {
    document.getElementById('table-empty').classList.remove('hidden');
    document.getElementById('ctable').classList.add('hidden');
    return;
  }

  document.getElementById('table-empty').classList.add('hidden');
  document.getElementById('ctable').classList.remove('hidden');

  const indexed = allResults.map((r, i) => [r, i]);
  const displayRows = currentFilter === 'all'
    ? indexed
    : indexed.filter(([r]) => r.risk_level === currentFilter);

  document.getElementById('table-body').innerHTML = displayRows.map(([r, origIdx], rowIdx) => {
    const pct     = (r.churn_probability * 100).toFixed(1);
    const isHigh  = r.risk_level === 'high';
    const factors = r.key_risk_factors?.length
      ? r.key_risk_factors.map(f => `<span class="ftag">${f}</span>`).join('')
      : '<span class="no-data">—</span>';

    const evTitle = r.recommended_event?.title || '—';
    const evDesc  = r.recommended_event?.description ? ` title="${r.recommended_event.description}"` : '';

    return `
      <tr data-index="${origIdx}" style="animation-delay:${rowIdx * 25}ms">
        <td><span class="cid">${r.customer_id || '—'}</span></td>
        <td>
          <div class="prob-cell">
            <span class="prob-text">${pct}%</span>
            <div class="prob-bar">
              <div class="prob-bar-fill ${isHigh ? 'high' : 'low'}" style="width:${pct}%"></div>
            </div>
          </div>
        </td>
        <td><span class="badge ${isHigh ? 'badge-high' : 'badge-low'}">${isHigh ? '고위험' : '저위험'}</span></td>
        <td>${renderClusterBadge(r)}</td>
        <td class="td-factors">${factors}</td>
        <td><span class="ev-name ${isHigh ? 'ev-high' : 'ev-low'}"${evDesc}>${evTitle}</span></td>
      </tr>`;
  }).join('');
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

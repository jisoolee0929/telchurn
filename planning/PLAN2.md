# Churn Dashboard — 개선 작업 실행 계획

> 기준 문서: `IMPROVEMENT.md` | 작성일: 2026-06-16  
> 전제: 기존 MVP(Step 1~5) 전체 완료 상태. Railway + Vercel 배포 중.

---

## 진행 현황

| Priority | 내용 | 상태 | PR | 완료일 |
|---|---|---|---|---|
| 1 | 디자인 개선 + ConnectCare 브랜딩 | ✅ 완료 | [#6](https://github.com/jisoolee0929/telchurn/pull/6) | 2026-06-16 |
| 2 | K-means 군집화 (k=4) 추가 | ✅ 완료 | [#8](https://github.com/jisoolee0929/telchurn/pull/8) | 2026-06-16 |
| 3 | What-if 시뮬레이터 | ⬜ 미완료 | — | — |

---

## 전체 흐름 요약

```
[Priority 1] ✅ 디자인 개선 + ConnectCare 브랜딩
    → node-server/public/ 파일 전체 수정
    → 라이트 테마 + KPI 카드 4개 + 레이아웃 재구성

[Priority 2] ✅ K-means 군집화 (k=4) 추가
    → python-server/train.py: KMeans 학습 + pkl 저장
    → python-server/app.py: CLUSTER_LABELS + ACTION_MAP + 응답 스키마 확장
    → node-server/public/dashboard.js: 군집 뱃지 렌더링

[Priority 3] ⬜ What-if 시뮬레이터
    → node-server/public/index.html: 사이드 패널 HTML
    → node-server/public/dashboard.js: 패널 로직 + 실시간 API 호출
    → node-server/public/style.css: 패널 + 슬라이더 스타일
```

---

## Priority 1 — 디자인 개선 + ConnectCare 브랜딩 ✅ 완료

> **완료일**: 2026-06-16 | **PR**: [#6](https://github.com/jisoolee0929/telchurn/pull/6) | **커밋**: `42031b9`

**목표**: 다크 테마 → 라이트 전문 통신사 대시보드 스타일 전환

### 1-1. `style.css` 전면 재작성

#### CSS 변수 (루트 정의)
- [x] `--primary: #1A6FE8`, `--bg-white: #FFFFFF`, `--bg: #F8FAFC`
- [x] `--danger: #E24B4A`, `--safe: #3B9E5F`
- [x] `--text: #1A1D2E`, `--text-sub: #6B7280`
- [x] `--border: #E5E7EB`, `--shadow: 0 1px 4px rgba(0,0,0,0.08)`
- [x] `--radius: 12px`, `--radius-sm: 8px`
- [x] 기존 다크 변수(`--bg`, `--accent`, `--surface` 등) 전부 제거

#### 레이아웃 구조
- [x] `body`: 배경 `#F8FAFC`, 폰트 `Pretendard Variable, system-ui`
- [x] `.header`: sticky 흰 배경 + 하단 1px `--border` 구분선
  - 좌: `.logo` (CC 마크 + ConnectCare 텍스트 + 슬로건)
  - 우: model-badge (Logistic Regression · Active)
- [x] `.kpi-grid`: 4컬럼 그리드, 상단 배치
- [x] `.main-grid`: 2컬럼 (280px 고정 | flex 1)
- [x] `.input-section`: 하단, 탭(CSV / 수동 입력) 포함

#### 카드 공통 스타일
- [x] `.card`: `background #FFF`, `border 1px solid --border`, `border-radius 12px`, `box-shadow --shadow`
- [x] `.kpi-card`: 숫자(`font-size 2rem, font-weight 800`) + 라벨(`font-size 12px, color --text-sub`)
- [x] `.kpi-card.kpi-danger` 숫자 색상: `--danger`
- [x] `.kpi-card.kpi-safe` 숫자 색상: `--safe`

#### 테이블 스타일
- [x] `thead`: `background #F8FAFC`, `font-size 11px`, `text-transform uppercase`, `color --text-sub`
- [x] 홀수 행: `#FFFFFF`, 짝수 행: `#F8FAFC` (`nth-child(even)`)
- [x] 호버: `background var(--primary-dim)` (#1A6FE8 8% 투명)

#### 뱃지 스타일
- [x] `.badge-high`: `background var(--danger-dim)`, `color var(--danger)`, `border-radius 100px`
- [x] `.badge-low`: `background var(--safe-dim)`, `color var(--safe)`
- [x] `.badge-cluster-green/red/blue/orange/gray`: 군집 5종 색상별 정의
  - green: `#ECFDF5 / #3B9E5F`
  - red: `#FEF2F2 / #E24B4A`
  - blue: `#EFF6FF / #1A6FE8`
  - orange: `#FFF7ED / #EA7C2A`
  - gray: `--bg / --text-light` (Priority 2 전 placeholder용)

#### 버튼 스타일
- [x] `.btn-primary`: `background --primary`, `color #FFF`, `border-radius --radius-sm`, `padding 11px 26px`
- [x] `.btn-outline`: `border 1px solid --border`, 텍스트 `--text`, hover 시 `--primary`

#### 이탈 확률 게이지 바
- [x] `.prob-bar`: `background --border-light`, `border-radius 3px`, `height 5px`
- [x] `.prob-bar-fill.high`: `background --danger` / `.prob-bar-fill.low`: `background --safe`

#### 반응형
- [x] 900px: `.main-grid` → 1컬럼
- [x] 680px: `.kpi-grid` → 2컬럼
- [x] 480px: `.kpi-grid` → 1컬럼, 패딩 축소

---

### 1-2. `index.html` 레이아웃 재구성

#### 헤더
- [x] 기존 ChurnSight 로고 → ConnectCare 브랜드로 교체
  - `.logo-mark` (CC 파란 사각 배지) + `.logo-name` + `.logo-slogan`

#### KPI 카드 섹션 추가
- [x] 헤더 아래에 `.kpi-grid` 항상 표시 (초기값 `—`)
  - `#kpi-total` / `#kpi-high` / `#kpi-low` / `#kpi-avg`

#### 메인 영역 재배치
- [x] `.main-grid` 2컬럼: 좌(`.left-col`: 차트 + 이벤트 카드) + 우(`.right-col`: 테이블)
- [x] 차트 빈 상태: `#chart-empty` 표시, `#chart-wrap` 기본 hidden
- [x] 테이블 빈 상태: `#table-empty` 표시, `#ctable` 기본 hidden
- [x] 테이블 컬럼: `고객 ID | 이탈 확률 | 위험도 | 군집 | 주요 위험 요인 | 추천 액션`

#### 데이터 입력 영역 (하단)
- [x] `.input-section` > `.input-card` 구조로 하단 배치
- [x] 탭 버튼: CSV 업로드 / 수동 입력

#### CDN 변경
- [x] Exo 2 / JetBrains Mono 폰트 CDN 제거
- [x] Pretendard Variable CDN 적용: `cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css`

---

### 1-3. `dashboard.js` 렌더링 로직 업데이트

#### KPI 카드 업데이트 함수 추가
- [x] `updateKPICards(summary, results)` 함수 작성
  - `#kpi-total` ← `summary.total`
  - `#kpi-high` ← `summary.high_risk`
  - `#kpi-low` ← `summary.low_risk`
  - `#kpi-avg` ← `results` 배열 평균 `churn_probability` (소수점 1자리 %)

#### 테이블 렌더링 업데이트
- [x] `renderTable()` — `allResults` 비어있으면 `#table-empty` 표시, `#ctable` hidden
- [x] 데이터 있으면 `#table-empty` hidden, `#ctable` 표시
- [x] 군집 컬럼: `r.cluster_name` 있으면 `badge-cluster-{color}`, 없으면 `badge-cluster-gray` (`—`)

#### 이탈 확률 표시
- [x] `.prob-cell` 구조: `<span class="prob-text">XX.X%</span>` + `.prob-bar` / `.prob-bar-fill.high|low`

#### 차트 렌더링
- [x] `renderChart()` 호출 시 `#chart-empty` hidden, `#chart-wrap` 표시
- [x] 색상: `['#E24B4A', '#3B9E5F']`
- [x] 범례 폰트: `'Pretendard Variable', system-ui`

#### 이벤트 카드
- [x] `ec-high` / `ec-low` 좌측 보더: `--danger` / `--safe`
- [x] 기존 아이콘/제목/설명/발동조건 구조 유지

---

### Priority 1 완료 조건
- [x] 흰 배경 라이트 테마 전체 적용 (다크 변수 잔재 없음)
- [x] ConnectCare 로고·슬로건 헤더 표시
- [x] KPI 카드 4개 — 총 고객 / 고위험 / 저위험 / 평균 이탈확률 렌더링
- [x] 테이블 게이지 바 + 군집 컬럼 자리(placeholder `—`) 표시
- [x] 반응형 레이아웃 900px/680px/480px 브레이크포인트 적용
- [x] CSV 업로드 / 수동 입력 / 차트 기존 기능 정상 동작 유지

---

## Priority 2 — K-means 군집화 (k=4) 추가 ✅ 완료

> **완료일**: 2026-06-16 | **PR**: [#8](https://github.com/jisoolee0929/telchurn/pull/8) | **커밋**: `d0cebb6`

**목표**: 이탈 예측에 군집 정보 추가 → 위험도 × 군집 8가지 추천 액션

### 군집 번호 검증 결과 (train.py 실행 후 groupby 출력)

| 군집 | tenure 평균 | 월요금 평균 | 이탈율 | 레이블 | 색상 |
|---|---|---|---|---|---|
| 0 | 54.8개월 | $34.98 | 5% | 장기 저비용 안정군 | green |
| 1 | 15.4개월 | $80.22 | 48% | 단기 고비용 이탈위험군 | red |
| 2 | 59.1개월 | $93.78 | 16% | 장기 고비용 우량군 | blue |
| 3 | 10.9개월 | $31.36 | 24% | 신규 저비용 관찰군 | orange |

→ IMPROVEMENT.md 예상값과 정확히 일치 — `CLUSTER_LABELS` 번호 수정 불필요

### 2-1. `python-server/train.py` 수정

#### 추가 import
- [x] `from sklearn.cluster import KMeans` 추가

#### 군집 학습 코드 추가 (기존 Logistic Regression 학습 이후)
- [x] `CLUSTER_FEATURES`, `cluster_scaler`, `kmeans` 정의 및 학습
- [x] `kmeans.pkl`, `cluster_scaler.pkl` 저장

- [x] 검증 출력 추가 — `df['cluster'] = kmeans.labels_` 후 groupby 결과 print

#### 실행 및 군집 번호 검증
- [x] `python train.py` 실행 → `kmeans.pkl`, `cluster_scaler.pkl` 생성 확인
- [x] groupby 출력에서 각 군집의 tenure/MonthlyCharges/이탈율 확인
- [x] IMPROVEMENT.md 표와 대조하여 번호 매핑 — 번호 수정 불필요

---

### 2-2. `python-server/app.py` 수정

#### 모델 로드 추가 (앱 시작 시)
- [x] `kmeans.pkl`, `cluster_scaler.pkl` 로드 코드 추가

#### 상수 정의 추가
- [x] `CLUSTER_FEATURES = ['tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend']`
- [x] `CLUSTER_LABELS` 딕셔너리 정의 (IMPROVEMENT.md 내용 그대로)
- [x] `ACTION_MAP` 딕셔너리 정의 — 8가지 `(risk_level, cluster_id)` 조합
- [x] 기존 `EVENT_MAP` 제거 (ACTION_MAP으로 대체)

#### 헬퍼 함수 수정
- [x] `get_recommended_event(risk_level, cluster_id)` 함수 추가

#### `/predict-batch` 엔드포인트 수정
- [x] 결과 dict에 군집 필드 추가: `cluster_id`, `cluster_name`, `cluster_description`, `cluster_color`
- [x] `recommended_event` → `get_recommended_event(risk_level, cluster_id)` 호출로 변경
- [x] `summary`에 `cluster_distribution: {0: N, 1: N, 2: N, 3: N}` 추가

#### `/predict-single` 엔드포인트 수정
- [x] 동일하게 단일 고객 군집 예측 로직 추가
- [x] 응답에 `cluster_id`, `cluster_name`, `cluster_description`, `cluster_color` 포함

#### 응답 스키마 변경 검증
- [x] Flask 로컬 실행 후 `predict-single` / `predict-batch` 4건 테스트 통과
- [x] 8가지 조합 중 4가지 직접 테스트: C001(high+1), C002(low+0), C003(low+2), C004(high+3)

---

### 2-3. `node-server/public/dashboard.js` 군집 뱃지 렌더링

#### 군집 뱃지 렌더 함수 추가
- [x] `renderClusterBadge(result)` 함수 작성 — tooltip에 `cluster_description` 포함
- [x] `CLUSTER_LABELS` 상수 정의 (app.py와 동기화)

#### 테이블 렌더링 업데이트
- [x] `renderTable()` — 군집 컬럼 셀 placeholder 제거 → `renderClusterBadge(r)` 호출
- [x] 추천 액션 컬럼 → `result.recommended_event.title` 표시 (툴팁에 description)

---

### 2-4. 배포 업데이트

- [x] 변경 사항 commit → GitHub push → PR #8 머지 → main 동기화
- [ ] Railway 자동 재배포 확인 (push 후 자동 트리거됨)
- [ ] 배포 후 E2E 검증: Vercel 대시보드에서 군집 뱃지 4종 정상 표시

---

### Priority 2 완료 조건
- [x] `python train.py` 실행 시 `kmeans.pkl`, `cluster_scaler.pkl` 생성
- [x] groupby 출력으로 군집 번호 검증 완료
- [x] `/predict-batch` 응답에 `cluster_id`, `cluster_name`, `cluster_color` 포함
- [x] `/predict-single` 응답에 동일 군집 필드 포함
- [x] `summary.cluster_distribution` 4개 키 포함
- [x] 대시보드 테이블 군집 뱃지 4종 색상(초록/빨강/파랑/주황) renderClusterBadge() 연결
- [x] 8가지 위험도 × 군집 조합 각각 다른 추천 액션 표시

---

## Priority 3 — What-if 시뮬레이터

**목표**: 테이블 행 클릭 → 사이드 패널 → 슬라이더/토글 조작 → 실시간 이탈 확률 갱신

### 3-1. `index.html` — 사이드 패널 HTML 추가

#### 패널 오버레이 + 드로어
- [ ] `</body>` 직전에 패널 HTML 추가
  ```html
  <!-- What-if 사이드 패널 -->
  <div id="whatif-overlay" class="whatif-overlay hidden"></div>
  <aside id="whatif-panel" class="whatif-panel hidden">
    <div class="whatif-header">
      <div>
        <div id="wif-customer-id" class="wif-customer-id"></div>
        <div id="wif-cluster-name" class="wif-cluster-name"></div>
      </div>
      <button id="wif-close" class="wif-close">✕</button>
    </div>

    <!-- 현재 확률 -->
    <div class="wif-prob-block">
      <div class="wif-prob-label">현재 이탈 확률</div>
      <div class="wif-prob-display" id="wif-original-prob"></div>
    </div>

    <!-- Feature 조정 영역 -->
    <div class="wif-controls">
      <div class="wif-control-group">
        <label>가입 기간 <span id="wif-tenure-val"></span>개월</label>
        <input type="range" id="wif-tenure" min="0" max="72" step="1">
      </div>
      <div class="wif-control-group">
        <label>월 요금 $<span id="wif-monthly-val"></span></label>
        <input type="range" id="wif-monthly" min="20" max="120" step="1">
      </div>
      <div class="wif-control-group">
        <label>계약 유형</label>
        <select id="wif-contract">
          <option value="Month-to-month">월간</option>
          <option value="One year">1년</option>
          <option value="Two year">2년</option>
        </select>
      </div>
      <div class="wif-control-group">
        <label>보안 서비스</label>
        <div class="wif-toggle-wrap">
          <span>미사용</span>
          <label class="toggle-switch">
            <input type="checkbox" id="wif-security">
            <span class="toggle-slider"></span>
          </label>
          <span>사용</span>
        </div>
      </div>
      <div class="wif-control-group">
        <label>결제 방식</label>
        <select id="wif-payment">
          <option value="Electronic check">전자수표</option>
          <option value="Mailed check">우편수표</option>
          <option value="Bank transfer (automatic)">자동이체</option>
          <option value="Credit card (automatic)">자동카드</option>
        </select>
      </div>
    </div>

    <!-- 조정 후 결과 -->
    <div class="wif-result-block">
      <div class="wif-prob-label">조정 후 이탈 확률</div>
      <div class="wif-prob-display" id="wif-adjusted-prob">-</div>
      <div id="wif-delta" class="wif-delta"></div>
      <div id="wif-cluster-change" class="wif-cluster-change hidden"></div>
      <div class="wif-action-card" id="wif-action"></div>
    </div>
  </aside>
  ```

---

### 3-2. `dashboard.js` — 패널 로직 추가

#### 전역 변수
- [ ] `let originalProbability = 0;`
- [ ] `let originalClusterId = null;`
- [ ] `let currentPanelCustomer = null;`
- [ ] `let recalcTimer = null;` (디바운스용)

#### `openWhatIfPanel(customer)` 함수
- [ ] 오버레이 + 패널 `.hidden` 제거 (슬라이드인)
- [ ] `originalProbability`, `originalClusterId`, `currentPanelCustomer` 설정
- [ ] `renderPanel(customer)` 호출

#### `renderPanel(customer)` 함수
- [ ] `#wif-customer-id` ← `customer.customer_id`
- [ ] `#wif-cluster-name` ← `customer.cluster_name`
- [ ] `#wif-original-prob` ← `(customer.churn_probability * 100).toFixed(1) + '%'`
- [ ] 슬라이더 초기값: `#wif-tenure` ← `customer.tenure`, `#wif-monthly` ← `customer.MonthlyCharges`
- [ ] 값 표시 span 업데이트: `#wif-tenure-val`, `#wif-monthly-val`
- [ ] select 초기값: `#wif-contract` ← `customer.Contract` (없으면 `Month-to-month`)
- [ ] checkbox: `#wif-security` ← `customer.OnlineSecurity === 'Yes'`
- [ ] select: `#wif-payment` ← `customer.PaymentMethod`
- [ ] `#wif-adjusted-prob` 초기화 (`-`)
- [ ] `#wif-delta`, `#wif-cluster-change`, `#wif-action` 초기화

#### `recalculate()` async 함수
- [ ] `currentPanelCustomer` 기반으로 조정된 데이터 객체 생성
  ```javascript
  const tenure = parseInt(document.getElementById('wif-tenure').value);
  const monthly = parseFloat(document.getElementById('wif-monthly').value);
  const contract = document.getElementById('wif-contract').value;
  const securityOn = document.getElementById('wif-security').checked;
  const payment = document.getElementById('wif-payment').value;

  const totalCharges = monthly * tenure;
  const avgMonthlySpend = tenure > 0 ? totalCharges / tenure : 0;

  const updatedData = {
    ...currentPanelCustomer,
    tenure,
    MonthlyCharges: monthly,
    TotalCharges: totalCharges,
    avg_monthly_spend: avgMonthlySpend,
    Contract: contract,
    OnlineSecurity: securityOn ? 'Yes' : 'No',
    PaymentMethod: payment
  };
  ```
- [ ] `POST /api/predict-single` 호출
- [ ] `updateProbabilityDisplay(result.churn_probability)` 호출
- [ ] `updateActionDisplay(result.recommended_event)` 호출
- [ ] 군집 변경 감지: `result.cluster_id !== originalClusterId` → `showClusterChangeNotice()`

#### `updateProbabilityDisplay(newProb)` 함수
- [ ] `#wif-adjusted-prob` ← `(newProb * 100).toFixed(1) + '%'`
- [ ] delta = `newProb - originalProbability`
- [ ] `#wif-delta`:
  - delta < 0: `▼ ${Math.abs(delta*100).toFixed(1)}%p` (초록색)
  - delta > 0: `▲ ${(delta*100).toFixed(1)}%p` (빨강색)
  - delta === 0: `변화 없음` (회색)

#### `updateActionDisplay(event)` 함수
- [ ] `#wif-action` 내용: `event.title` + `event.description` + `event.trigger_condition`

#### `showClusterChangeNotice(oldId, newId)` 함수
- [ ] `#wif-cluster-change` `.hidden` 제거
- [ ] 내용: `군집 변경: ${CLUSTER_LABELS[oldId].name} → ${CLUSTER_LABELS[newId].name}`
- [ ] 단, `CLUSTER_LABELS`는 JS 내 상수로 복사 정의

#### 이벤트 리스너 바인딩
- [ ] 슬라이더 `input` 이벤트: 값 span 실시간 갱신 + 디바운스(300ms) `recalculate()`
- [ ] select/checkbox `change` 이벤트: 즉시 `recalculate()`
- [ ] `#wif-close` 클릭: 패널 닫기 (`.hidden` 추가)
- [ ] `#whatif-overlay` 클릭: 패널 닫기
- [ ] 테이블 행 `click` 이벤트: `openWhatIfPanel(result)` 호출
  - 행에 `data-index` 속성 추가해 `results` 배열 참조

#### JS 내 `CLUSTER_LABELS` 상수 정의
- [ ] `const CLUSTER_LABELS = { 0: {name: ...}, 1: {...}, 2: {...}, 3: {...} }` 정의
  (군집 변경 알림에서 사용)

---

### 3-3. `style.css` — 사이드 패널 스타일 추가

#### 오버레이
- [ ] `.whatif-overlay`: `position fixed; inset 0; background rgba(0,0,0,0.3); z-index 100`
- [ ] `.whatif-overlay.hidden`: `display none`

#### 패널 드로어
- [ ] `.whatif-panel`:
  - `position fixed; top 0; right 0; height 100vh; width 380px`
  - `background #FFF; box-shadow -4px 0 20px rgba(0,0,0,0.12)`
  - `overflow-y auto; padding 24px; z-index 101`
  - `transform translateX(100%); transition transform 0.3s ease`
- [ ] `.whatif-panel:not(.hidden)`: `transform translateX(0)`
- [ ] `.whatif-panel.hidden`: `transform translateX(100%)`

#### 패널 헤더
- [ ] `.whatif-header`: `display flex; justify-content space-between; align-items flex-start; margin-bottom 20px`
- [ ] `.wif-customer-id`: `font-size 1.1rem; font-weight 700`
- [ ] `.wif-cluster-name`: `font-size 0.85rem; color --text-sub; margin-top 2px`
- [ ] `.wif-close`: 원형 닫기 버튼, `32px × 32px; border-radius 50%; border 1px solid --border`

#### 확률 표시 블록
- [ ] `.wif-prob-block`: `background #F8FAFC; border-radius 8px; padding 16px; margin-bottom 20px`
- [ ] `.wif-prob-label`: `font-size 0.75rem; color --text-sub; text-transform uppercase; margin-bottom 4px`
- [ ] `.wif-prob-display`: `font-size 2rem; font-weight 800; color --text-main`

#### 컨트롤 그룹
- [ ] `.wif-controls`: `display flex; flex-direction column; gap 16px`
- [ ] `.wif-control-group label`: `font-size 0.85rem; font-weight 600; display block; margin-bottom 6px`
- [ ] `input[type=range]`: 커스텀 트랙/thumb 스타일 (파란색 `--primary`)
- [ ] `select#wif-contract, select#wif-payment`: 기존 `.form-control` 스타일 적용

#### 토글 스위치
- [ ] `.toggle-switch`: `position relative; width 44px; height 24px`
- [ ] `.toggle-slider`: 슬라이드 원 + 배경 (#CBD5E1 → `--primary` 체크 시)
- [ ] `.wif-toggle-wrap`: `display flex; align-items center; gap 8px`

#### 결과 블록
- [ ] `.wif-result-block`: `margin-top 24px; padding-top 24px; border-top 1px solid --border`
- [ ] `.wif-delta`:
  - `font-size 1rem; font-weight 700; margin-top 4px`
  - `.delta-down`: `color --safe`
  - `.delta-up`: `color --danger`
- [ ] `.wif-cluster-change`: `background #FFF7ED; border-radius 6px; padding 8px 12px; margin-top 8px; font-size 0.85rem; color #EA7C2A`
- [ ] `.wif-cluster-change.hidden`: `display none`
- [ ] `.wif-action-card`: `margin-top 12px; padding 12px; background #F8FAFC; border-radius 8px; border-left 3px solid --primary`

#### 반응형
- [ ] 480px 미만: `.whatif-panel` → `width 100vw`

---

### 3-4. 기능 통합 테스트 (로컬)

- [ ] `vercel dev` 실행 상태에서:
  1. CSV 업로드 → 결과 테이블 표시
  2. 테이블 행 클릭 → 사이드 패널 열림 확인
  3. 슬라이더 조작 → 조정 후 확률 실시간 갱신 확인
  4. 변화량 (+/-) 색상 표시 확인
  5. 군집이 바뀌는 시나리오 테스트 (tenure 크게 올리기)
  6. 군집 변경 알림 텍스트 표시 확인
  7. 패널 닫기(✕ / 오버레이 클릭) 동작 확인
  8. TotalCharges 자동 재계산 확인 (tenure 10, Monthly $50 → TotalCharges 500)

---

### Priority 3 완료 조건
- [ ] 테이블 행 클릭 시 사이드 패널 슬라이드인
- [ ] 패널에 선택된 고객의 현재 feature 값 자동 채워짐
- [ ] 슬라이더/토글/셀렉트 조작 시 이탈 확률 실시간 갱신 (300ms 디바운스)
- [ ] 원본 대비 변화량(`+/-Xp%`) 색상 표시
- [ ] 확률 변화에 따라 추천 액션도 함께 갱신
- [ ] tenure/MonthlyCharges 변경 시 TotalCharges = MonthlyCharges × tenure 자동 계산
- [ ] 군집이 바뀔 때 변경 알림 표시
- [ ] 오버레이 클릭 / ✕ 버튼으로 패널 닫힘

---

## 배포 전략

### 각 우선순위 완료 후 즉시 배포
```
Priority 1 완료 ✅ (PR #6, 2026-06-16)
  → branch: improvement/priority1-design-branding → main 머지 완료
  → Vercel 자동 재배포 완료

Priority 2 완료 ✅ (PR #8, 2026-06-16)
  → branch: improvement/priority2-kmeans-clustering → main 머지 완료
  → Railway/Vercel 자동 재배포 트리거됨

Priority 3 완료 ⬜
  → git add node-server/ && git commit && git push
  → Vercel 자동 재배포
```

### 배포 후 E2E 체크
- [x] Priority 1: `https://node-server-tawny.vercel.app` ConnectCare 라이트 테마 확인
- [x] Priority 2: PR #8 머지 완료, Railway/Vercel 재배포 트리거됨
- [ ] Priority 2 배포 후: `https://telchurn-production.up.railway.app/health` 워밍업 확인
- [ ] Priority 2 배포 후: Vercel 대시보드에서 군집 뱃지 4종 표시 확인
- [ ] Priority 3 완료 후: What-if 패널 전체 기능 E2E 확인

---

## 변경 파일 목록

```
Priority 1:
  수정  node-server/public/style.css
  수정  node-server/public/index.html
  수정  node-server/public/dashboard.js

Priority 2:
  수정  python-server/train.py
  수정  python-server/app.py
  생성  python-server/kmeans.pkl         (runtime, git 포함)
  생성  python-server/cluster_scaler.pkl (runtime, git 포함)
  수정  node-server/public/dashboard.js  (군집 뱃지 렌더링)

Priority 3:
  수정  node-server/public/index.html   (사이드 패널 HTML)
  수정  node-server/public/dashboard.js (패널 로직)
  수정  node-server/public/style.css    (패널 스타일)
```

---

## 주의사항

| 항목 | 내용 |
|---|---|
| 군집 번호 검증 필수 | train.py 실행 후 groupby 출력으로 번호 매핑 확인 후 app.py 수정 |
| cluster_scaler 분리 | 기존 preprocessor와 별도 StandardScaler 사용 (혼용 금지) |
| transform만 호출 | app.py에서 `cluster_scaler.fit_transform()` 절대 금지 |
| feature 순서 유지 | CLUSTER_FEATURES 순서 train.py ↔ app.py 동일하게 유지 |
| TotalCharges 재계산 | What-if에서 tenure 변경 시 반드시 자동 재계산 후 API 전달 |
| 디바운스 처리 | 슬라이더 `input` 이벤트에 300ms 디바운스 적용 (API 과호출 방지) |
| Railway 슬립 모드 | Priority 2 재배포 후 시연 전 `/health` 워밍업 필수 |

# Churn Dashboard — 개선 작업 지시서

기존 CLAUDE.md의 구조를 유지하면서 아래 3가지 작업을 순서대로 진행한다.
각 작업은 독립적으로 완성 후 다음 작업으로 넘어간다.

---

## 우선순위 1 — 디자인 개선 + 가상 통신사 브랜딩

### 목표
현재 어두운 다크 테마를 밝고 전문적인 통신사 대시보드 스타일로 교체한다.

### 브랜드 설정
```
서비스명: ConnectCare
슬로건: 고객을 먼저 생각하는 통신사
주색상: #1A6FE8 (신뢰감을 주는 블루)
보조색상: #F0F4FF (연한 블루 배경)
위험 색상: #E24B4A (고위험 빨강)
안전 색상: #3B9E5F (저위험 초록)
폰트: Pretendard 또는 system-ui
```

### 변경할 파일
`node-server/public/` 하위 파일 전체

### 레이아웃 구조
```
┌─────────────────────────────────────────────────────┐
│  ConnectCare 로고   고객 이탈 예측 관리 시스템        │  ← 헤더 (흰 배경, 블루 로고)
├─────────────────────────────────────────────────────┤
│  총 고객수   고위험   저위험   평균 이탈확률           │  ← 요약 카드 4개 (KPI)
├──────────────┬──────────────────────────────────────┤
│              │  고객 목록 테이블                      │
│  위험도 분포  │  (이탈확률 / 위험도 / 군집 / 액션)     │  ← 메인 영역
│  파이 차트   │                                       │
│              │                                       │
├──────────────┴──────────────────────────────────────┤
│  데이터 입력: [CSV 업로드]  [수동 입력]               │  ← 하단 입력 영역
└─────────────────────────────────────────────────────┘
```

### 테이블 컬럼
```
고객 ID | 이탈 확률 (게이지 바) | 위험도 뱃지 | 군집 뱃지 | 주요 위험 요인 | 추천 액션
```

### 스타일 규칙
- 배경: 흰색 (#FFFFFF) 또는 연한 회색 (#F8FAFC)
- 카드: 흰색 배경, 1px 연한 회색 테두리, border-radius 12px, 가벼운 그림자
- 헤더: 흰 배경 + 하단 1px 구분선
- 테이블: 홀짝 행 배경색 구분 (#FFFFFF / #F8FAFC)
- 뱃지: 고위험(빨강 배경+텍스트), 저위험(초록 배경+텍스트)
- 군집 뱃지: 군집마다 다른 색상 (아래 CLUSTER_LABELS 참고)
- 버튼: #1A6FE8 블루, 흰 텍스트, border-radius 8px

---

## 우선순위 2 — K-means 군집화 추가 (k=4, 실제 데이터 기반)

### 배경 및 근거
실제 Telco Customer Churn 데이터(7,043건)로 Elbow Method를 실행한 결과
k=4가 군집 간 특성 차이가 가장 명확하게 나타났다.

특히 저비용 고객을 k=3에서는 하나로 묶었으나,
tenure 55개월(이탈율 5%)과 tenure 11개월(이탈율 24%)은
고객 관계 단계가 완전히 달라 액션도 달라야 하므로 k=4로 결정.

### 실제 데이터로 확인된 군집 특성

| 군집 | 고객비율 | tenure평균 | 월요금평균 | 이탈율 | 월간계약 | 자동결제 | 보안서비스 |
|------|---------|-----------|-----------|--------|---------|---------|---------|
| 0    | 15.8%   | 55개월     | $35       | 5%     | 16%     | 62%     | 24%     |
| 1    | 32.6%   | 15개월     | $80       | 48%    | 86%     | 31%     | 23%     |
| 2    | 27.1%   | 59개월     | $94       | 16%    | 27%     | 62%     | 54%     |
| 3    | 24.5%   | 11개월     | $31       | 24%    | 71%     | 28%     | 11%     |

### 군집 해석 및 전략 방향

**군집 0 — 장기 저비용 안정군**
- 특성: 락인 완료된 충성 고객. 저비용 요금제 만족 중.
- 이탈율 5%로 가장 낮음. 자동결제 62%로 결제 안정성 높음.
- 전략 방향: 현재 만족도를 유지하면서 프리미엄 서비스 업셀링 적기

**군집 1 — 단기 고비용 이탈위험군** ← 핵심 관리 대상
- 특성: 월간계약 86% + 고비용 조합이 이탈 주원인.
- 전체 고객의 32.6%이면서 이탈율 48%. 가장 큰 위험군.
- 전략 방향: 요금 할인으로 비용 부담 완화 + 장기계약 전환 유도

**군집 2 — 장기 고비용 우량군**
- 특성: 고부가가치 서비스(보안, 기술지원) 다수 이용 중.
- 이탈율 16%로 낮지만 이탈 시 매출 손실이 가장 큼 (월 $94).
- 전략 방향: VIP 전담 CS + 이탈 징후 조기 감지

**군집 3 — 신규 저비용 관찰군**
- 특성: 군집 0과 요금대 유사하지만 tenure가 1/5 수준.
- 락인 전 단계. 월간계약 71%로 언제든 이탈 가능.
- 전략 방향: 온보딩 가이드 + 서비스 체험 유도로 군집 0으로 성장 유도

### 변경할 파일
`python-server/train.py`, `python-server/app.py`

### train.py 추가 작업

```python
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

# 군집화 전용 feature (수치형만 사용)
CLUSTER_FEATURES = ['tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend']

X_cluster = df[CLUSTER_FEATURES].copy()

# 군집화 전용 스케일러 (기존 preprocessor와 반드시 분리)
cluster_scaler = StandardScaler()
X_cluster_scaled = cluster_scaler.fit_transform(X_cluster)

# k=4 고정 (Elbow Method + 도메인 해석으로 결정)
kmeans = KMeans(n_clusters=4, random_state=42, n_init=10)
kmeans.fit(X_cluster_scaled)

# 저장
with open('kmeans.pkl', 'wb') as f:
    pickle.dump(kmeans, f)
with open('cluster_scaler.pkl', 'wb') as f:
    pickle.dump(cluster_scaler, f)

# 검증 출력 (실행 후 군집 번호가 아래 CLUSTER_LABELS와 일치하는지 확인)
df['cluster'] = kmeans.labels_
print(df.groupby('cluster')[CLUSTER_FEATURES + ['Churn_binary']].mean().round(2))
```

> **중요**: KMeans는 실행 환경에 따라 군집 번호(0,1,2,3)가
> 위 표와 다르게 배정될 수 있다.
> train.py 실행 후 groupby 출력의 tenure/월요금/이탈율을 확인하고
> 아래 CLUSTER_LABELS의 숫자 키를 실제 출력에 맞게 수정한다.

### app.py — CLUSTER_LABELS 정의

```python
# 군집화 feature 순서 (train.py와 반드시 동일하게 유지)
CLUSTER_FEATURES = ['tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend']

# 실제 데이터(7,043건) 분석 기반 군집 정의
# train.py 실행 후 groupby 출력으로 번호 검증 필수
CLUSTER_LABELS = {
    0: {
        "name": "장기 저비용 안정군",
        "description": "tenure 55개월, 월 $35 — 락인 완료된 충성 고객",
        "color": "green",
        "churn_rate": 0.05,
        "size_pct": 15.8
    },
    1: {
        "name": "단기 고비용 이탈위험군",
        "description": "tenure 15개월, 월 $80 — 월간계약 86%, 즉각 개입 필요",
        "color": "red",
        "churn_rate": 0.48,
        "size_pct": 32.6
    },
    2: {
        "name": "장기 고비용 우량군",
        "description": "tenure 59개월, 월 $94 — 고부가가치 서비스 다수 이용",
        "color": "blue",
        "churn_rate": 0.16,
        "size_pct": 27.1
    },
    3: {
        "name": "신규 저비용 관찰군",
        "description": "tenure 11개월, 월 $31 — 락인 전 단계, 성장 가능성",
        "color": "orange",
        "churn_rate": 0.24,
        "size_pct": 24.5
    }
}
```

### app.py — ACTION_MAP 정의 (위험도 × 군집 = 8가지 액션)

```python
ACTION_MAP = {
    # 고위험 + 장기 저비용 안정군 (희귀 케이스 — 특별 불만 사건 의심)
    ("high", 0): {
        "type": "vip_cs",
        "title": "VIP 전담 상담 긴급 배정",
        "description": "장기 충성 고객의 이탈 신호 — 전담 CS 즉시 연결",
        "trigger_condition": "이탈 확률 50% 이상 + tenure 24개월 초과",
        "reason": "장기 고객의 이탈은 특정 불만 사건에서 비롯됨. 즉각 원인 파악 필요"
    },
    # 고위험 + 단기 고비용 이탈위험군 (핵심 대응 대상)
    ("high", 1): {
        "type": "discount_contract",
        "title": "요금 할인 + 장기계약 전환 유도",
        "description": "3개월 20% 할인 쿠폰 + 1년 계약 전환 시 추가 혜택 제공",
        "trigger_condition": "월간계약 + MonthlyCharges $60 이상",
        "reason": "월간계약 86% + 고비용이 이탈 주원인. 비용 부담 완화와 락인 동시 필요"
    },
    # 고위험 + 장기 고비용 우량군 (손실 최대 방어)
    ("high", 2): {
        "type": "vip_retention",
        "title": "VIP 맞춤 혜택 + 전담 CS",
        "description": "전담 상담사 배정 + 사용 중인 서비스 업그레이드 무료 제공",
        "trigger_condition": "이탈 확률 50% 이상 + MonthlyCharges $80 이상",
        "reason": "이탈 시 월 $94 매출 손실. 고부가가치 고객 이탈 방어가 최우선"
    },
    # 고위험 + 신규 저비용 관찰군
    ("high", 3): {
        "type": "onboarding_intensive",
        "title": "온보딩 집중 지원 + 서비스 무료 체험",
        "description": "전담 온보딩 가이드 + 보안 서비스 1개월 무료 체험 제공",
        "trigger_condition": "tenure 12개월 미만 + 이탈 확률 50% 이상",
        "reason": "신규 저비용 고객의 이탈은 서비스 미경험에서 비롯됨. 체험 유도로 락인"
    },
    # 저위험 + 장기 저비용 안정군 (업셀링 최적 타이밍)
    ("low", 0): {
        "type": "upsell",
        "title": "프리미엄 서비스 업그레이드 제안",
        "description": "현재 요금제 대비 추가 혜택 안내 + 첫 달 무료 업그레이드 체험",
        "trigger_condition": "tenure 24개월 이상 + 추가 서비스 미이용",
        "reason": "락인 완료 + 이탈 위험 낮음. 만족도 높은 시점이 업셀링 최적 타이밍"
    },
    # 저위험 + 단기 고비용 이탈위험군 (선제 락인)
    ("low", 1): {
        "type": "contract_incentive",
        "title": "장기계약 전환 혜택 안내",
        "description": "1년 계약 전환 시 월 10% 할인 + 부가서비스 1개 무료 제공",
        "trigger_condition": "월간계약 + tenure 6~18개월",
        "reason": "아직 이탈 확률 낮지만 월간계약 유지 시 위험군으로 전환 가능. 선제 락인"
    },
    # 저위험 + 장기 고비용 우량군 (충성도 강화)
    ("low", 2): {
        "type": "loyalty_reward",
        "title": "장기 고객 감사 혜택",
        "description": "연간 이용 감사 리워드 + 신규 서비스 우선 체험 기회 제공",
        "trigger_condition": "tenure 24개월 이상 + 이탈 확률 50% 미만",
        "reason": "고부가가치 고객의 만족도 유지. 감사 혜택으로 충성도 강화"
    },
    # 저위험 + 신규 저비용 관찰군 (자연스러운 정착 유도)
    ("low", 3): {
        "type": "onboarding_guide",
        "title": "서비스 탐색 가이드 발송",
        "description": "미사용 서비스 안내 이메일 + 이용 팁 콘텐츠 발송",
        "trigger_condition": "tenure 12개월 미만 + 이탈 확률 50% 미만",
        "reason": "이탈 위험은 낮지만 서비스 탐색 중인 단계. 자연스러운 정착 유도"
    }
}

def get_recommended_event(risk_level: str, cluster_id: int) -> dict:
    return ACTION_MAP.get((risk_level, cluster_id), ACTION_MAP[("low", 3)])
```

### app.py — 추론 로직 수정

```python
# 모델 로드 (기존 코드에 추가)
with open('kmeans.pkl', 'rb') as f:
    kmeans = pickle.load(f)
with open('cluster_scaler.pkl', 'rb') as f:
    cluster_scaler = pickle.load(f)

# predict-batch 엔드포인트 내부 추론 로직
def predict_batch(customers: list) -> dict:
    df = pd.DataFrame(customers)

    # avg_monthly_spend 파생 feature 생성
    df['avg_monthly_spend'] = np.where(
        df['tenure'] > 0,
        df['TotalCharges'] / df['tenure'],
        0
    )

    # 1. 이탈 확률 (기존 로직 유지)
    X_transformed = preprocessor.transform(df[TOP10_FEATURES])
    churn_probs = model.predict_proba(X_transformed)[:, 1]

    # 2. 군집 예측 (추가)
    X_cluster = df[CLUSTER_FEATURES].copy()
    X_cluster_scaled = cluster_scaler.transform(X_cluster)
    cluster_ids = kmeans.predict(X_cluster_scaled)

    # 3. 결과 결합
    results = []
    cluster_counts = {0: 0, 1: 0, 2: 0, 3: 0}

    for i, customer in enumerate(customers):
        prob = float(churn_probs[i])
        cluster_id = int(cluster_ids[i])
        risk_level = "high" if prob >= 0.5 else "low"
        cluster_info = CLUSTER_LABELS[cluster_id]
        cluster_counts[cluster_id] += 1

        results.append({
            "customer_id": customer.get("customer_id", f"C{i+1:03d}"),
            "churn_probability": round(prob, 4),
            "risk_level": risk_level,
            "cluster_id": cluster_id,
            "cluster_name": cluster_info["name"],
            "cluster_description": cluster_info["description"],
            "cluster_color": cluster_info["color"],
            "key_risk_factors": extract_risk_factors(customer),
            "recommended_event": get_recommended_event(risk_level, cluster_id)
        })

    high_risk = sum(1 for r in results if r["risk_level"] == "high")

    return {
        "results": results,
        "summary": {
            "total": len(results),
            "high_risk": high_risk,
            "low_risk": len(results) - high_risk,
            "cluster_distribution": cluster_counts
        }
    }
```

### 응답 JSON 최종 구조

```json
{
  "results": [
    {
      "customer_id": "C001",
      "churn_probability": 0.878,
      "risk_level": "high",
      "cluster_id": 1,
      "cluster_name": "단기 고비용 이탈위험군",
      "cluster_description": "tenure 15개월, 월 $80 — 월간계약 86%, 즉각 개입 필요",
      "cluster_color": "red",
      "key_risk_factors": ["짧은 가입 기간", "높은 월 요금", "월간계약"],
      "recommended_event": {
        "type": "discount_contract",
        "title": "요금 할인 + 장기계약 전환 유도",
        "description": "3개월 20% 할인 쿠폰 + 1년 계약 전환 시 추가 혜택 제공",
        "trigger_condition": "월간계약 + MonthlyCharges $60 이상",
        "reason": "월간계약 86% + 고비용이 이탈 주원인. 비용 부담 완화와 락인 동시 필요"
      }
    }
  ],
  "summary": {
    "total": 10,
    "high_risk": 4,
    "low_risk": 6,
    "cluster_distribution": {
      "0": 2,
      "1": 3,
      "2": 3,
      "3": 2
    }
  }
}
```

---

## 우선순위 3 — What-if 시뮬레이터

### 목표
고객 테이블에서 행을 클릭하면 사이드 패널이 열리고,
feature 값을 조정했을 때 이탈 확률이 실시간으로 변하는 것을 보여준다.

### 변경할 파일
`node-server/public/dashboard.js`, `node-server/public/index.html`
`node-server/api/predict-single.js` (기존 파일 활용)

### UI 구조
```
[고객 목록 테이블] → 행 클릭 →

┌─────────────────────────────────┐
│  C001 — 단기 고비용 이탈위험군   │
│                                 │
│  현재 이탈 확률: 87.8% [████░]  │
│  군집: 단기 고비용 이탈위험군    │
│                                 │
│  ── feature 조정 ──             │
│  가입 기간   [━━●━━━━] 15개월   │  ← 슬라이더
│  월 요금     [━━━━━●━] $80     │  ← 슬라이더
│  계약 유형   [월간 ↔ 1년]       │  ← 토글
│  보안 서비스 [미사용 ↔ 사용]    │  ← 토글
│  결제 방식   [전자수표 ▼]       │  ← 셀렉트
│                                 │
│  조정 후 이탈 확률: 61.2% [███░]│  ← 실시간 갱신
│  변화: -26.6%p ↓               │
│  추천 액션 변경: 장기계약 혜택   │  ← 액션도 함께 갱신
│                                 │
└─────────────────────────────────┘
```

### 동작 방식

```javascript
// dashboard.js

let originalProbability = 0;
let originalCluster = null;

// 1. 테이블 행 클릭 시 사이드 패널 열기
function openWhatIfPanel(customer) {
  originalProbability = customer.churn_probability;
  originalCluster = customer.cluster_id;
  // 슬라이더·토글 초기값을 현재 고객 데이터로 설정
  renderPanel(customer);
}

// 2. 슬라이더·토글 변경 시 /api/predict-single 즉시 호출
async function recalculate(updatedData) {
  // TotalCharges 자동 재계산 (tenure 변경 시)
  updatedData.TotalCharges = updatedData.MonthlyCharges * updatedData.tenure;
  updatedData.avg_monthly_spend = updatedData.tenure > 0
    ? updatedData.TotalCharges / updatedData.tenure
    : 0;

  const res = await fetch('/api/predict-single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedData)
  });
  const result = await res.json();

  // 3. 확률 변화 및 액션 갱신
  const delta = result.churn_probability - originalProbability;
  updateProbabilityDisplay(result.churn_probability, delta);
  updateActionDisplay(result.recommended_event);

  // 군집이 바뀌었을 때 알림
  if (result.cluster_id !== originalCluster) {
    showClusterChangeNotice(originalCluster, result.cluster_id);
  }
}
```

### 조정 가능한 feature
```
tenure          슬라이더   0 ~ 72개월
MonthlyCharges  슬라이더   $20 ~ $120
Contract        토글       월간 / 1년 / 2년
OnlineSecurity  토글       미사용 / 사용
PaymentMethod   셀렉트     전자수표 / 우편수표 / 자동이체 / 자동카드
```

> TotalCharges와 avg_monthly_spend는 tenure·MonthlyCharges 변경 시
> `TotalCharges = MonthlyCharges × tenure` 로 자동 재계산해서 Flask에 전달.
> 군집도 실시간으로 재예측되므로 추천 액션도 함께 갱신된다.

---

## 작업 완료 체크리스트

### 우선순위 1 완료 조건
- [ ] ConnectCare 로고·브랜드명 헤더에 표시
- [ ] 흰색 배경 라이트 테마 적용
- [ ] KPI 요약 카드 4개 (총 고객 / 고위험 / 저위험 / 평균 이탈확률)
- [ ] 테이블에 군집 컬럼 추가 (우선순위 2 이후 채워짐)

### 우선순위 2 완료 조건
- [ ] train.py 실행 시 kmeans.pkl, cluster_scaler.pkl 생성
- [ ] train.py 실행 후 groupby 출력 확인 → CLUSTER_LABELS 번호 검증
- [ ] Flask /predict-batch 응답에 cluster_id, cluster_name 포함
- [ ] 대시보드 테이블 군집 뱃지 4종 표시 (초록/빨강/파랑/주황)
- [ ] 위험도 × 군집 8가지 조합으로 추천 액션 각각 다르게 표시
- [ ] summary에 cluster_distribution 포함

### 우선순위 3 완료 조건
- [ ] 테이블 행 클릭 시 사이드 패널 열림
- [ ] 슬라이더·토글 조작 시 이탈 확률 실시간 갱신
- [ ] 원본 대비 확률 변화량 (+/- %p) 표시
- [ ] 확률 변화에 따라 추천 액션도 함께 갱신
- [ ] tenure 변경 시 TotalCharges 자동 재계산 후 전달
- [ ] 군집이 바뀌었을 때 변경 알림 표시

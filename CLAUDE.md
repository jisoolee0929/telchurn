# Churn Prediction Dashboard MVP — CLAUDE.md

## 프로젝트 개요

통신사 고객 이탈(Churn) 예측 대시보드.
CSV 업로드 또는 수동 입력으로 고객 데이터를 넣으면,
실제 Logistic Regression 모델이 이탈 확률을 추론하고
위험도별 분포와 이벤트 추천을 대시보드로 표시한다.

- **목적**: 포트폴리오용 풀스택 ML 서비스 (실제 배포)
- **데이터**: Kaggle Telco Customer Churn
- **ML**: Python(sklearn) → model.pkl → Flask API
- **프론트/중계**: Node.js(Vercel) + Vanilla JS
- **배포**: Flask → Railway / Node.js → Vercel

---

## 디렉토리 구조

```
churn-dashboard-mvp/
├── CLAUDE.md
│
├── python-server/              # Railway 배포
│   ├── train.py                # 모델 학습 → pkl 저장
│   ├── app.py                  # Flask API 서버
│   ├── model.pkl               # 학습된 Logistic Regression
│   ├── preprocessor.pkl        # fit된 ColumnTransformer 전체
│   ├── requirements.txt
│   └── Procfile
│
└── node-server/                # Vercel 배포
    ├── vercel.json
    ├── package.json
    ├── .env                    # 로컬 전용, Git 제외
    ├── .gitignore
    ├── api/
    │   ├── predict-batch.js    # CSV/배열 일괄 예측
    │   └── predict-single.js   # 단일 고객 예측
    └── public/
        ├── index.html          # 대시보드 단일 페이지
        ├── dashboard.js        # 차트·테이블·이벤트 카드 렌더링
        └── style.css
```

---

## 핵심 도메인 지식 — 모델

### 알고리즘
- Logistic Regression
- `class_weight='balanced'` (Yes:No 불균형 보정)
- `solver='liblinear'`, `max_iter=1000`, `random_state=42`

### Top 10 Feature (LGBM Feature Importance 선정)

| Feature | 유형 | 전처리 | 이탈 방향 |
|---|---|---|---|
| tenure | 수치 연속 | StandardScaler | 낮을수록 위험 ↑ |
| MonthlyCharges | 수치 연속 | StandardScaler | 높을수록 위험 ↑ |
| TotalCharges | 수치 연속 | StandardScaler | 낮을수록 위험 ↑ |
| avg_monthly_spend | 수치 파생 | StandardScaler | TotalCharges/tenure |
| PaymentMethod | 범주 | OneHotEncoder(drop='first') | electronic_check 위험 |
| OnlineSecurity | 범주 | OneHotEncoder(drop='first') | No 사용 시 위험 |
| TechSupport | 범주 | OneHotEncoder(drop='first') | No 사용 시 위험 |
| StreamingTV | 범주 | OneHotEncoder(drop='first') | 중립 |
| StreamingMovies | 범주 | OneHotEncoder(drop='first') | 중립 |
| SeniorCitizen | 이진 | passthrough | 고령 소폭 위험 |

### 목표 성능 (test set 기준)
- Recall > 0.70 / F1 > 0.60 / AUPRC > 0.40
- 실제 달성: Recall 0.762 / F1 0.600 / AUPRC 0.638

---

## Step 1 — 모델 학습 (python-server/train.py)

### 전처리 파이프라인
```python
import numpy as np
import pandas as pd
import pickle
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

df = pd.read_csv('WA_Fn-UseC_-Telco-Customer-Churn.csv')

# 파생 feature 생성
df['avg_monthly_spend'] = np.where(
    df['tenure'] > 0,
    df['TotalCharges'].apply(pd.to_numeric, errors='coerce').fillna(0) / df['tenure'],
    0
)

# 이진 인코딩
binary_map = {'Yes': 1, 'No': 0}
for col in ['Partner', 'Dependents', 'PhoneService', 'PaperlessBilling', 'Churn']:
    df[col] = df[col].map(binary_map)

top10 = ['tenure','MonthlyCharges','TotalCharges','avg_monthly_spend',
         'PaymentMethod','OnlineSecurity','TechSupport',
         'StreamingTV','StreamingMovies','SeniorCitizen']

numerical_cols  = ['tenure','MonthlyCharges','TotalCharges','avg_monthly_spend']
categorical_cols = ['PaymentMethod','OnlineSecurity','TechSupport','StreamingTV','StreamingMovies']
binary_cols     = ['SeniorCitizen']

X = df[top10]
y = df['Churn']

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

preprocessor = ColumnTransformer(transformers=[
    ('num', StandardScaler(), numerical_cols),
    ('cat', OneHotEncoder(drop='first', handle_unknown='ignore'), categorical_cols),
    ('bin', 'passthrough', binary_cols),
])

model = LogisticRegression(
    max_iter=1000, class_weight='balanced',
    solver='liblinear', random_state=42
)

X_train_t = preprocessor.fit_transform(X_train)
model.fit(X_train_t, y_train)

# 저장 — preprocessor와 model 분리 저장
with open('preprocessor.pkl', 'wb') as f:
    pickle.dump(preprocessor, f)
with open('model.pkl', 'wb') as f:
    pickle.dump(model, f)

print("학습 완료. model.pkl / preprocessor.pkl 저장됨")
```

> **반드시**: X_train에만 fit(), X_test/추론 시엔 transform()만 호출

---

## Step 2 — Flask API 서버 (python-server/app.py)

### 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | /predict-batch | 고객 배열 일괄 예측 |
| POST | /predict-single | 단일 고객 예측 |
| GET | /health | 헬스체크 |

### /predict-batch 입력 스펙
```json
{
  "customers": [
    {
      "customer_id": "C001",
      "tenure": 12,
      "MonthlyCharges": 70.5,
      "TotalCharges": 846.0,
      "PaymentMethod": "Electronic check",
      "OnlineSecurity": "No",
      "TechSupport": "No",
      "StreamingTV": "Yes",
      "StreamingMovies": "No",
      "SeniorCitizen": 0
    }
  ]
}
```

### /predict-batch 응답 스펙
```json
{
  "results": [
    {
      "customer_id": "C001",
      "churn_probability": 0.72,
      "risk_level": "high",
      "key_risk_factors": ["짧은 가입 기간", "전자수표 결제", "보안 서비스 미사용"],
      "recommended_event": {
        "type": "discount",
        "title": "재방문 유도 이벤트",
        "description": "특별 쿠폰 및 혜택 자동 발급",
        "trigger_condition": "5일 미접속"
      }
    }
  ],
  "summary": {
    "total": 1,
    "high_risk": 0,
    "low_risk": 0
  }
}
```

### 위험도 분류 기준 (이진 분류)
```python
def classify_risk(prob: float) -> str:
    # 모델의 predict() 결과(0/1)와 동일한 기준으로 0.5 임계값 사용
    return "high" if prob >= 0.5 else "low"
```

### 이벤트 추천 규칙 (이진 분류 기반)
```python
EVENT_MAP = {
    "high": {
        "type": "discount",
        "title": "재방문 유도 이벤트",
        "description": "특별 쿠폰 및 혜택 자동 발급",
        "trigger_condition": "5일 미접속",
        "icon": "gift",
        "badge_color": "red"
    },
    "low": {
        "type": "loyalty",
        "title": "충성 고객 혜택",
        "description": "장기 가입 감사 혜택 안내",
        "trigger_condition": "tenure 24개월 이상",
        "icon": "star",
        "badge_color": "green"
    }
}
```

### 주요 위험 요인 추출 로직
```python
def extract_risk_factors(row: dict) -> list[str]:
    factors = []
    if row['tenure'] < 12:
        factors.append("짧은 가입 기간")
    if row['MonthlyCharges'] > 70:
        factors.append("높은 월 요금")
    if row['PaymentMethod'] == 'Electronic check':
        factors.append("전자수표 결제")
    if row['OnlineSecurity'] == 'No':
        factors.append("보안 서비스 미사용")
    if row['TechSupport'] == 'No':
        factors.append("기술지원 미사용")
    if row['SeniorCitizen'] == 1:
        factors.append("고령 고객")
    return factors[:3]  # 최대 3개
```

### CORS 설정
```python
from flask_cors import CORS
CORS(app, origins=[
    "http://localhost:3000",
    "https://*.vercel.app"
])
```

### python-server/requirements.txt
```
flask==3.0.0
flask-cors==4.0.0
scikit-learn==1.4.0
pandas==2.1.0
numpy==1.26.0
gunicorn==21.2.0
```

### python-server/Procfile
```
web: gunicorn app:app --bind 0.0.0.0:$PORT
```

---

## Step 3 — Node.js 중계 (node-server/api/)

### predict-batch.js — CSV 배열 일괄 중계
```javascript
// node-server/api/predict-batch.js
const PYTHON_API_URL = process.env.PYTHON_API_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const response = await fetch(`${PYTHON_API_URL}/predict-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'batch_prediction_failed', message: err.message });
  }
}
```

### 환경변수
```
# node-server/.env (로컬)
PYTHON_API_URL=http://localhost:5000

# Vercel 대시보드 (배포)
PYTHON_API_URL=https://your-app.railway.app
```

---

## Step 4 — 대시보드 UI (node-server/public/)

### 기능 목록

| 기능 | 설명 |
|---|---|
| CSV 업로드 | 고객 데이터 CSV 드래그앤드롭 → 일괄 예측 |
| 수동 입력 폼 | 단일 고객 10개 feature 입력 → 예측 |
| 위험도 분포 차트 | 파이 차트 — High(빨강)/Low(초록) 비율 |
| 고객 목록 테이블 | 이탈 확률 내림차순 정렬, 위험도 뱃지, 필터 |
| 이벤트 추천 카드 | 위험도별 카드 UI — 아이콘/제목/설명/발동조건 |

### CSV 포맷 (업로드 템플릿)
```
customer_id,tenure,MonthlyCharges,TotalCharges,PaymentMethod,OnlineSecurity,TechSupport,StreamingTV,StreamingMovies,SeniorCitizen
C001,12,70.5,846.0,Electronic check,No,No,Yes,No,0
C002,48,45.0,2160.0,Bank transfer (automatic),Yes,Yes,No,No,0
```

### 대시보드 렌더링 흐름 (dashboard.js)
1. CSV 파싱(PapaParse) 또는 수동 폼 데이터 수집
2. `POST /api/predict-batch` 또는 `/api/predict-single` 호출
3. 응답 `results` 배열로:
   - 파이 차트 렌더링 (Chart.js)
   - 고객 테이블 렌더링 (확률 내림차순)
   - 이벤트 카드 렌더링 (위험도별 구분)

### 사용 라이브러리 (CDN)
```html
<!-- CSV 파싱 -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
<!-- 차트 -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
```

---

## Step 5 — 배포

### 5-1. Python 서버 → Railway
1. `python-server/` 를 GitHub에 push
2. Railway → New Project → Deploy from GitHub
3. Root Directory: `python-server`
4. 환경변수 없음 (model.pkl은 레포에 포함)
5. 배포 후 Railway URL 복사

### 5-2. Node.js → Vercel
1. `node-server/` 를 GitHub에 push
2. Vercel → New Project → Deploy from GitHub
3. Root Directory: `node-server`
4. Environment Variables: `PYTHON_API_URL` = Railway URL
5. 자동 배포

### node-server/vercel.json
```json
{
  "version": 2,
  "builds": [
    { "src": "api/*.js", "use": "@vercel/node" },
    { "src": "public/**", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" },
    { "src": "/(.*)", "dest": "/public/$1" }
  ]
}
```

---

## 로컬 실행 순서

```bash
# 터미널 1 — Python 모델 학습 및 Flask 서버
cd python-server
pip install -r requirements.txt
python train.py          # model.pkl, preprocessor.pkl 생성
python app.py            # http://localhost:5000

# 터미널 2 — Node.js
cd node-server
npm install
vercel dev               # http://localhost:3000
```

---

## 주의사항

- **열 순서 고정**: Flask에서 DataFrame 생성 시 feature 순서를
  `['tenure','MonthlyCharges','TotalCharges','avg_monthly_spend',
    'PaymentMethod','OnlineSecurity','TechSupport','StreamingTV','StreamingMovies','SeniorCitizen']`
  로 항상 고정. 순서 다르면 추론 결과 완전히 틀어짐.

- **transform만 호출**: Flask app.py에서 `preprocessor.fit_transform()` 절대 금지.
  반드시 `preprocessor.transform(df)` 만 사용.

- **TotalCharges 타입**: 원본 CSV에서 object로 읽힘.
  `pd.to_numeric(df['TotalCharges'], errors='coerce').fillna(0)` 처리 필수.

- **Railway 슬립 모드**: 무료 플랜은 15분 미사용 시 슬립.
  시연 전 `/health` 엔드포인트로 워밍업 요청 1회 필수.

- **CORS**: Flask에 flask-cors 미설정 시 브라우저 요청 전체 차단.

- **model.pkl Git 포함**: .gitignore에 추가하지 않음.
  파일이 크면 Git LFS 사용.

---

## 진행 상황 (2026-06-06 기준)

### 완료

#### Step 1 — 모델 학습
- `python-server/requirements.txt` 작성
  - Python 3.13 호환 버전으로 조정: `pandas==2.2.3`, `numpy==2.1.3`, `scikit-learn==1.5.2`
- `python-server/train.py` 작성 및 실행
- `model.pkl` / `preprocessor.pkl` 생성 완료
- 성능 검증 통과:

  | 지표 | 결과 | 목표 |
  |---|---|---|
  | Recall | 0.786 | > 0.70 |
  | F1 | 0.618 | > 0.60 |
  | AUPRC | 0.626 | > 0.40 |

- Step 1 단위 테스트 통과:
  - pkl 로드 정상
  - `preprocessor.transform()` 단독 호출 정상 (fit_transform 미사용 확인)
  - 고위험 샘플 이탈 확률 0.891 (≥ 0.5)
  - 저위험 샘플 이탈 확률 0.027 (< 0.5)
  - 변환 후 피처 수 16개 정상

#### Step 2 — Flask API 서버
- `python-server/app.py` 작성 완료
  - `GET /health`, `POST /predict-single`, `POST /predict-batch` 구현
  - `classify_risk()`, `extract_risk_factors()`, `EVENT_MAP` 구현
  - CORS 설정 (`localhost:3000`, `*.vercel.app`)
  - pkl 로드는 앱 시작 시 1회, 추론 시 `preprocessor.transform()` 만 사용
- `python-server/Procfile` 작성 완료
- Step 2 테스트 전체 통과 (22개 항목):
  - `/health` 정상
  - 고위험 샘플: 확률 0.891, risk_level `high`, 위험요인 3개, discount 이벤트 카드
  - 저위험 샘플: 확률 0.027, risk_level `low`, loyalty 이벤트 카드
  - `tenure=0` ZeroDivision 방지 정상
  - `SeniorCitizen=1` 위험 요인 단독 포함 정상
  - `/predict-batch` summary 집계 (total/high_risk/low_risk) 정상
  - 빈 바디 / `customers` 필드 누락 → 400 반환 정상

#### Step 3 — Node.js 중계 서버
- `node-server/` 디렉토리 구조 생성 완료 (`api/`, `public/`)
- `package.json` 작성 완료 (`"type": "module"` 포함)
- `vercel.json` 작성 완료
  - `builds`: `@vercel/node`(api), `@vercel/static`(public)
  - `routes`: `/api/predict-batch` → `.js`, `/api/predict-single` → `.js` 명시적 매핑
  - 초기 `routes` 설정 오류 수정: `/api/(.*)` → `/api/$1` 패턴이 파일을 못 찾는 문제 → 경로별 명시 매핑으로 교체
- `.env` 작성 완료 (`PYTHON_API_URL=http://localhost:5000`)
- `.gitignore` 작성 완료 (`.env`, `node_modules/`, `.vercel/` 제외)
- `api/predict-batch.js` 작성 완료 (Flask `/predict-batch` 중계, 500 에러 핸들링)
- `api/predict-single.js` 작성 완료 (Flask `/predict-single` 중계, 500 에러 핸들링)
- Step 3 테스트 전체 통과 (16개 항목, vercel dev 실서버 기준):
  - `/api/predict-single` Node → Flask 중계 정상 (churn_probability, risk_level, recommended_event, key_risk_factors, customer_id 보존)
  - `/api/predict-batch` Node → Flask 배치 중계 정상 (results 2건, summary 집계)
  - GET 메서드 → 405 반환 정상
  - Flask 다운 시 → 500 반환 정상

#### Step 4 — 대시보드 UI
- `node-server/public/index.html` 작성 완료
  - 폰트: Exo 2 (헤딩) + JetBrains Mono (수치) + DM Sans (본문)
  - PapaParse 5.4.1 / Chart.js 4.4.1 CDN 포함
  - CSV 업로드(드래그앤드롭 + 파일선택 + 템플릿 다운로드), 수동 입력 폼(10개 feature), 결과 영역(요약 카드/차트/이벤트카드/테이블) 구현
- `node-server/public/dashboard.js` 작성 완료
  - 탭 전환, 드롭존, PapaParse CSV 파싱, 템플릿 다운로드
  - `/api/predict-batch` / `/api/predict-single` fetch 연동
  - avg_monthly_spend 클라이언트 자동 계산 (tenure > 0 ? TotalCharges / tenure : 0)
  - Chart.js 도넛 차트 렌더링 (high=빨강 / low=초록)
  - 이탈 확률 내림차순 정렬 테이블 + 위험도 필터 버튼
  - 이벤트 카드 렌더링 (고위험/저위험 각 1장, 중복 제거)
  - 로딩/에러 상태 핸들링
- `node-server/public/style.css` 작성 완료 (17.3 KB)
  - 다크 미션컨트롤 테마 (`--bg: #08111F`, `--accent: #38BDF8`)
  - 위험도 뱃지, 확률 프로그레스바, 이벤트 카드 좌측 컬러 보더
  - 반응형 레이아웃 (900px / 680px / 480px 브레이크포인트)
- Step 4 테스트 전체 통과 (40개 항목):
  - 정적 파일 서빙 (index.html / style.css / dashboard.js) 정상
  - API E2E (predict-single, predict-batch, 이탈확률 내림차순 정렬, summary 집계) 정상
  - dashboard.js 함수 15개 정의 및 로직 검증 정상
  - HTML 태그 균형 51/51 정상 (초기 UTF-8 인코딩 오탐 수정)

#### Step 5 — Railway / Vercel 배포 (진행 중)
- `python-server/.gitignore` 생성 완료 (CSV, `__pycache__/`, `*.pyc`, `.env` 제외)
- Railway CLI 미설치 → GitHub 연동 방식으로 웹 UI 통해 배포 진행
- Vercel CLI 54.9.1 설치됨 → CLI로 배포 가능

### 미완료

- [ ] Step 5-1 — Railway Python 서버 배포 (GitHub 연동, Root: `python-server`)
- [ ] Step 5-2 — Vercel Node.js 배포 (`PYTHON_API_URL` = Railway URL 설정 필요)
- [ ] Railway URL / Vercel URL 확인 및 기록

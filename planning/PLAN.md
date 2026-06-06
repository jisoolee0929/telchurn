# Churn Prediction Dashboard MVP — 실행 계획

> 기준 문서: `CLAUDE.md` | 작성일: 2026-06-06

---

## 전체 흐름 요약

```
[Step 1] 모델 학습 (train.py)
    → model.pkl / preprocessor.pkl 생성
[Step 2] Flask API 서버 (app.py)
    → /predict-batch, /predict-single, /health
[Step 3] Node.js 중계 서버 (api/)
    → Vercel Serverless Functions
[Step 4] 대시보드 UI (public/)
    → index.html + dashboard.js + style.css
[Step 5] 배포
    → Python: Railway / Node.js: Vercel
```

---

## Step 1 — Python 모델 학습

**목표**: Logistic Regression 모델 학습 후 `model.pkl` / `preprocessor.pkl` 저장

### 1-1. 디렉토리 및 파일 생성
- [ ] `python-server/` 디렉토리 생성
- [ ] `python-server/requirements.txt` 작성
  ```
  flask==3.0.0
  flask-cors==4.0.0
  scikit-learn==1.4.0
  pandas==2.1.0
  numpy==1.26.0
  gunicorn==21.2.0
  ```
- [ ] Kaggle 데이터셋 다운로드: `WA_Fn-UseC_-Telco-Customer-Churn.csv` → `python-server/` 에 배치

### 1-2. `python-server/train.py` 작성
- [ ] CSV 로드 + `TotalCharges` → `pd.to_numeric(..., errors='coerce').fillna(0)` 처리
- [ ] 파생 feature `avg_monthly_spend = TotalCharges / tenure` (tenure=0이면 0) 생성
- [ ] `Churn`, `Partner` 등 이진 컬럼 → `{'Yes':1, 'No':0}` 매핑
- [ ] Top 10 feature 선택:
  `tenure, MonthlyCharges, TotalCharges, avg_monthly_spend, PaymentMethod, OnlineSecurity, TechSupport, StreamingTV, StreamingMovies, SeniorCitizen`
- [ ] `ColumnTransformer` 구성:
  - `num`: `StandardScaler` → 수치 4개
  - `cat`: `OneHotEncoder(drop='first', handle_unknown='ignore')` → 범주 5개
  - `bin`: `passthrough` → `SeniorCitizen`
- [ ] `train_test_split(test_size=0.2, random_state=42, stratify=y)`
- [ ] `preprocessor.fit_transform(X_train)` + `model.fit(...)` 수행
- [ ] **`preprocessor.pkl`** / **`model.pkl`** 분리 저장
- [ ] 목표 성능 검증 출력: Recall > 0.70 / F1 > 0.60 / AUPRC > 0.40

### 1-3. 학습 실행 및 확인
```bash
cd python-server
pip install -r requirements.txt
python train.py
# → model.pkl, preprocessor.pkl 생성 확인
```

---

## Step 2 — Flask API 서버

**목표**: 학습된 모델을 REST API로 서빙

### 2-1. `python-server/app.py` 작성

#### 공통 초기화
- [ ] `model.pkl` / `preprocessor.pkl` 로드 (앱 시작 시 1회)
- [ ] `flask_cors.CORS` 설정:
  ```python
  CORS(app, origins=["http://localhost:3000", "https://*.vercel.app"])
  ```

#### GET `/health`
- [ ] `{"status": "ok"}` 반환 (Railway 슬립 모드 워밍업용)

#### POST `/predict-single`
- [ ] 요청 JSON에서 고객 1건 파싱
- [ ] `avg_monthly_spend` 파생 feature 계산
- [ ] feature 순서 고정 후 DataFrame 생성
- [ ] `preprocessor.transform(df)` (fit_transform 금지)
- [ ] `model.predict_proba(...)` → 확률 추출
- [ ] `classify_risk()`, `extract_risk_factors()`, `EVENT_MAP` 적용
- [ ] 응답 반환

#### POST `/predict-batch`
- [ ] `customers` 배열 반복 처리 (`/predict-single` 로직 재사용)
- [ ] `summary` 집계: `total`, `high_risk`, `low_risk`
- [ ] `{"results": [...], "summary": {...}}` 반환

#### 핵심 헬퍼 함수
- [ ] `classify_risk(prob)` → `"high"` if prob >= 0.5 else `"low"`
- [ ] `extract_risk_factors(row)` → 최대 3개 요인 리스트
- [ ] `EVENT_MAP` 딕셔너리 정의 (high/low 두 케이스)

### 2-2. `python-server/Procfile` 작성
```
web: gunicorn app:app --bind 0.0.0.0:$PORT
```

### 2-3. 로컬 Flask 서버 실행 및 API 테스트
```bash
python app.py  # http://localhost:5000
# curl http://localhost:5000/health
# curl -X POST http://localhost:5000/predict-single -d '{...}'
```

---

## Step 3 — Node.js 중계 서버

**목표**: Vercel Serverless로 Flask API를 프론트엔드에 중계

### 3-1. 디렉토리 및 설정 파일 생성
- [ ] `node-server/` 디렉토리 구조 생성:
  ```
  node-server/
  ├── api/
  ├── public/
  ├── package.json
  ├── vercel.json
  ├── .env
  └── .gitignore
  ```
- [ ] `package.json` 작성 (`"type": "module"` 포함)
- [ ] `.env` 작성: `PYTHON_API_URL=http://localhost:5000`
- [ ] `.gitignore` 작성: `.env`, `node_modules/` 제외
- [ ] `vercel.json` 작성:
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

### 3-2. `node-server/api/predict-batch.js` 작성
- [ ] `POST` 외 메서드 → 405 반환
- [ ] `process.env.PYTHON_API_URL` 로 Flask에 fetch 중계
- [ ] 오류 시 `{"error": "batch_prediction_failed", "message": ...}` 반환

### 3-3. `node-server/api/predict-single.js` 작성
- [ ] predict-batch.js와 동일한 구조로 `/predict-single` 중계

### 3-4. 로컬 실행 확인
```bash
cd node-server
npm install
vercel dev  # http://localhost:3000
```

---

## Step 4 — 대시보드 UI

**목표**: 단일 페이지 대시보드 — CSV 업로드 / 수동 입력 / 차트 / 테이블 / 이벤트 카드

### 4-1. `node-server/public/index.html` 작성
- [ ] CDN 스크립트 포함:
  - PapaParse 5.4.1 (CSV 파싱)
  - Chart.js 4.4.1 (파이 차트)
- [ ] 레이아웃 섹션:
  1. 헤더 (타이틀)
  2. CSV 업로드 영역 (드래그앤드롭 + 파일 선택 + 템플릿 다운로드)
  3. 수동 입력 폼 (10개 feature 입력 필드)
  4. 결과 요약 카드 (전체 / 고위험 / 저위험 수)
  5. 파이 차트 영역
  6. 고객 목록 테이블
  7. 이벤트 추천 카드 영역

### 4-2. `node-server/public/dashboard.js` 작성

#### CSV 업로드 흐름
- [ ] PapaParse로 CSV 파싱 → 고객 배열 생성
- [ ] `avg_monthly_spend` 클라이언트 사전 계산 (없으면 서버에서 처리)
- [ ] `POST /api/predict-batch` 호출

#### 수동 입력 흐름
- [ ] 폼 데이터 수집 → `POST /api/predict-single` 호출

#### 결과 렌더링
- [ ] **파이 차트**: Chart.js — High(빨강) / Low(초록) 비율
- [ ] **고객 테이블**: 이탈 확률 내림차순 정렬, 위험도 뱃지 (`high`=빨강, `low`=초록), 위험도 필터 버튼
- [ ] **이벤트 카드**: 위험도별 아이콘/제목/설명/발동조건 표시
- [ ] **요약 카드**: total / high_risk / low_risk 숫자 업데이트

#### CSV 템플릿 다운로드
- [ ] 헤더 + 샘플 2행 포함 CSV Blob 생성 → 다운로드 링크

### 4-3. `node-server/public/style.css` 작성
- [ ] 전체 레이아웃 (그리드/플렉스)
- [ ] 위험도 뱃지 스타일 (`.badge-high`, `.badge-low`)
- [ ] 카드, 테이블, 폼 기본 스타일
- [ ] 드래그앤드롭 영역 하이라이트 스타일

### 4-4. UI 기능 통합 테스트 (로컬)
- [ ] CSV 업로드 → 결과 렌더링 확인
- [ ] 수동 입력 → 단일 예측 확인
- [ ] 파이 차트 / 테이블 / 이벤트 카드 정상 표시 확인
- [ ] 위험도 필터 동작 확인

---

## Step 5 — 배포

### 5-1. GitHub 저장소 준비
- [ ] `.gitignore` 확인: `.env`, `__pycache__/`, `*.pyc` 제외
- [ ] `model.pkl` / `preprocessor.pkl` Git에 포함 (LFS 필요 시 적용)
- [ ] 전체 코드 push

### 5-2. Railway — Python 서버 배포
- [ ] Railway → New Project → Deploy from GitHub
- [ ] Root Directory: `python-server`
- [ ] 배포 완료 후 Railway URL 복사 (예: `https://your-app.railway.app`)
- [ ] `GET /health` 로 배포 확인

### 5-3. Vercel — Node.js 배포
- [ ] Vercel → New Project → Deploy from GitHub
- [ ] Root Directory: `node-server`
- [ ] Environment Variables 설정: `PYTHON_API_URL` = Railway URL
- [ ] 배포 완료 후 Vercel URL에서 대시보드 동작 확인

### 5-4. 최종 E2E 확인
- [ ] Vercel 대시보드에서 CSV 업로드 → 예측 결과 정상 출력
- [ ] Railway 슬립 모드 대비: 시연 전 `/health` 워밍업 요청

---

## 주의사항 체크리스트

| 항목 | 내용 |
|---|---|
| feature 순서 고정 | Flask DataFrame 생성 시 항상 Top 10 순서 준수 |
| transform만 사용 | `preprocessor.fit_transform()` Flask에서 절대 금지 |
| TotalCharges 타입 | `pd.to_numeric(..., errors='coerce').fillna(0)` 필수 |
| CORS 설정 | `flask-cors` 없으면 브라우저 요청 전체 차단 |
| model.pkl Git 포함 | `.gitignore`에 추가 금지 |
| Railway 슬립 모드 | 시연 전 `/health` 워밍업 1회 필수 |

---

## 파일 생성 체크리스트 (전체)

```
python-server/
  ✅ requirements.txt
  ✅ train.py
  ✅ app.py
  ✅ Procfile
  (runtime) model.pkl
  (runtime) preprocessor.pkl
  (외부) WA_Fn-UseC_-Telco-Customer-Churn.csv

node-server/
  ✅ package.json
  ✅ vercel.json
  ✅ .env
  ✅ .gitignore
  ✅ api/predict-batch.js
  ✅ api/predict-single.js
  ✅ public/index.html
  ✅ public/dashboard.js
  ✅ public/style.css
```

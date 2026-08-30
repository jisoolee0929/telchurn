import numpy as np
import pandas as pd
import pickle
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import recall_score, f1_score, average_precision_score, precision_score
import json

df = pd.read_csv('WA_Fn-UseC_-Telco-Customer-Churn.csv')

df['TotalCharges'] = pd.to_numeric(df['TotalCharges'], errors='coerce').fillna(0)

df['avg_monthly_spend'] = np.where(
    df['tenure'] > 0,
    df['TotalCharges'] / df['tenure'],
    0
)

binary_map = {'Yes': 1, 'No': 0}
for col in ['Partner', 'Dependents', 'PhoneService', 'PaperlessBilling', 'Churn']:
    df[col] = df[col].map(binary_map)

# Contract는 이 데이터셋의 단일 신호로는 가장 강하다
# (월간 42.7% vs 2년 계약 2.8%, 격차 39.9%p — PaymentMethod의 30.0%보다 크다).
# 다만 tenure·요금이 이미 같은 분산의 상당 부분을 잡고 있어 증분 기여는 작다
# (AUPRC 0.626 → 0.627). 그럼에도 넣는 이유는 성능이 아니라 제품 정합성이다:
# What-if 시뮬레이터가 "계약 유형"을 조작 레버로 제공하고 추천 액션이
# "장기계약 전환 유도"를 말하는데, 모델이 Contract를 못 보면 그 레버는 가짜다.
FEATURES = [
    'tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend',
    'PaymentMethod', 'OnlineSecurity', 'TechSupport',
    'StreamingTV', 'StreamingMovies', 'SeniorCitizen', 'Contract'
]

numerical_cols  = ['tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend']
categorical_cols = ['PaymentMethod', 'OnlineSecurity', 'TechSupport', 'StreamingTV', 'StreamingMovies', 'Contract']
binary_cols     = ['SeniorCitizen']

X = df[FEATURES]
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

X_test_t = preprocessor.transform(X_test)
y_pred = model.predict(X_test_t)
y_prob = model.predict_proba(X_test_t)[:, 1]

recall = recall_score(y_test, y_pred)
f1     = f1_score(y_test, y_pred)
auprc  = average_precision_score(y_test, y_prob)

print(f"Recall : {recall:.3f}  (목표 > 0.70)")
print(f"F1     : {f1:.3f}  (목표 > 0.60)")
print(f"AUPRC  : {auprc:.3f}  (목표 > 0.40)")

assert recall > 0.70, f"Recall {recall:.3f} 목표 미달"
assert f1     > 0.60, f"F1 {f1:.3f} 목표 미달"
assert auprc  > 0.40, f"AUPRC {auprc:.3f} 목표 미달"

# Contract 레버가 실제로 작동하는지 확인한다. 이 검증이 없으면
# UI에 드롭다운만 있고 확률은 꿈쩍 않는 상태로 되돌아가도 알 수 없다.
probe = pd.DataFrame([{
    'tenure': 12, 'MonthlyCharges': 70.5, 'TotalCharges': 846.0,
    'avg_monthly_spend': 70.5, 'PaymentMethod': 'Electronic check',
    'OnlineSecurity': 'No', 'TechSupport': 'No', 'StreamingTV': 'Yes',
    'StreamingMovies': 'No', 'SeniorCitizen': 0, 'Contract': c,
} for c in ['Month-to-month', 'One year', 'Two year']])[FEATURES]
probe_prob = model.predict_proba(preprocessor.transform(probe))[:, 1]
print()
print("=== Contract 레버 검증 (다른 조건 동일) ===")
for c, pr in zip(['Month-to-month', 'One year', 'Two year'], probe_prob):
    print(f"  {c:16} {pr:.4f}")
assert probe_prob[0] - probe_prob[2] > 0.05, "Contract가 확률을 유의하게 움직이지 않음"

# ── 임계값별 성능 표 ────────────────────────────────────────────────────────
# 대시보드는 "고위험"을 확정처럼 보여주지만 이 임계값의 정밀도는 0.5 수준이다.
# 즉 연락 두 건 중 한 건은 헛수고다. 운영진이 캠페인 예산에 맞춰 기준선을
# 직접 고를 수 있도록, 테스트셋에서 측정한 실제 수치를 함께 배포한다.
threshold_rows = []
for t in [round(0.05 * i, 2) for i in range(4, 17)]:
    pred = (y_prob >= t).astype(int)
    if pred.sum() == 0:
        continue
    threshold_rows.append({
        "threshold": t,
        "precision": round(float(precision_score(y_test, pred, zero_division=0)), 4),
        "recall":    round(float(recall_score(y_test, pred)), 4),
        "f1":        round(float(f1_score(y_test, pred)), 4),
        "flag_rate": round(float(pred.mean()), 4),
    })

metrics_payload = {
    "test_size":      int(len(y_test)),
    "base_rate":      round(float(y_test.mean()), 4),
    "auprc":          round(float(auprc), 4),
    "default_threshold": 0.5,
    "thresholds":     threshold_rows,
}
with open('threshold_metrics.json', 'w', encoding='utf-8') as f:
    json.dump(metrics_payload, f, ensure_ascii=False, indent=2)

print()
print("=== 임계값별 성능 (테스트셋 %d건, 실제 이탈률 %.1f%%) ===" % (len(y_test), y_test.mean() * 100))
for r in threshold_rows:
    if r["threshold"] in (0.3, 0.4, 0.5, 0.6, 0.7):
        print("  t=%.2f  정밀도 %.3f  재현율 %.3f  플래그율 %.3f"
              % (r["threshold"], r["precision"], r["recall"], r["flag_rate"]))

with open('preprocessor.pkl', 'wb') as f:
    pickle.dump(preprocessor, f)
with open('model.pkl', 'wb') as f:
    pickle.dump(model, f)

print("학습 완료. model.pkl / preprocessor.pkl 저장됨")

# ── K-means 군집화 (k=4) ─────────────────────────────────────────────────────
CLUSTER_FEATURES = ['tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend']

X_cluster = df[CLUSTER_FEATURES].copy()
cluster_scaler = StandardScaler()
X_cluster_scaled = cluster_scaler.fit_transform(X_cluster)

kmeans = KMeans(n_clusters=4, random_state=42, n_init=10)
kmeans.fit(X_cluster_scaled)

with open('kmeans.pkl', 'wb') as f:
    pickle.dump(kmeans, f)
with open('cluster_scaler.pkl', 'wb') as f:
    pickle.dump(cluster_scaler, f)

# 군집 번호 검증 출력
df['cluster'] = kmeans.labels_
print("\n=== 군집별 평균 특성 ===")
print(df.groupby('cluster')[CLUSTER_FEATURES + ['Churn']].mean().round(2))
print("\n=== 군집별 고객 수 ===")
print(df.groupby('cluster').size())
print("\n군집화 완료. kmeans.pkl / cluster_scaler.pkl 저장됨")

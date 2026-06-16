import numpy as np
import pandas as pd
import pickle
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import recall_score, f1_score, average_precision_score

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

top10 = [
    'tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend',
    'PaymentMethod', 'OnlineSecurity', 'TechSupport',
    'StreamingTV', 'StreamingMovies', 'SeniorCitizen'
]

numerical_cols  = ['tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend']
categorical_cols = ['PaymentMethod', 'OnlineSecurity', 'TechSupport', 'StreamingTV', 'StreamingMovies']
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

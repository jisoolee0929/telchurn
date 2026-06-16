import pickle
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "https://*.vercel.app"])

with open('preprocessor.pkl', 'rb') as f:
    preprocessor = pickle.load(f)
with open('model.pkl', 'rb') as f:
    model = pickle.load(f)
with open('kmeans.pkl', 'rb') as f:
    kmeans = pickle.load(f)
with open('cluster_scaler.pkl', 'rb') as f:
    cluster_scaler = pickle.load(f)

FEATURE_ORDER = [
    'tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend',
    'PaymentMethod', 'OnlineSecurity', 'TechSupport',
    'StreamingTV', 'StreamingMovies', 'SeniorCitizen'
]

CLUSTER_FEATURES = ['tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend']

CLUSTER_LABELS = {
    0: {
        "name": "장기 저비용 안정군",
        "description": "tenure 55개월, 월 $35 — 락인 완료된 충성 고객",
        "color": "green",
    },
    1: {
        "name": "단기 고비용 이탈위험군",
        "description": "tenure 15개월, 월 $80 — 월간계약 86%, 즉각 개입 필요",
        "color": "red",
    },
    2: {
        "name": "장기 고비용 우량군",
        "description": "tenure 59개월, 월 $94 — 고부가가치 서비스 다수 이용",
        "color": "blue",
    },
    3: {
        "name": "신규 저비용 관찰군",
        "description": "tenure 11개월, 월 $31 — 락인 전 단계, 성장 가능성",
        "color": "orange",
    },
}

ACTION_MAP = {
    ("high", 0): {
        "type": "vip_cs",
        "title": "VIP 전담 상담 긴급 배정",
        "description": "장기 충성 고객의 이탈 신호 — 전담 CS 즉시 연결",
        "trigger_condition": "이탈 확률 50% 이상 + tenure 24개월 초과",
        "icon": "gift",
        "badge_color": "red",
    },
    ("high", 1): {
        "type": "discount_contract",
        "title": "요금 할인 + 장기계약 전환 유도",
        "description": "3개월 20% 할인 쿠폰 + 1년 계약 전환 시 추가 혜택 제공",
        "trigger_condition": "월간계약 + MonthlyCharges $60 이상",
        "icon": "gift",
        "badge_color": "red",
    },
    ("high", 2): {
        "type": "vip_retention",
        "title": "VIP 맞춤 혜택 + 전담 CS",
        "description": "전담 상담사 배정 + 사용 중인 서비스 업그레이드 무료 제공",
        "trigger_condition": "이탈 확률 50% 이상 + MonthlyCharges $80 이상",
        "icon": "gift",
        "badge_color": "red",
    },
    ("high", 3): {
        "type": "onboarding_intensive",
        "title": "온보딩 집중 지원 + 서비스 무료 체험",
        "description": "전담 온보딩 가이드 + 보안 서비스 1개월 무료 체험 제공",
        "trigger_condition": "tenure 12개월 미만 + 이탈 확률 50% 이상",
        "icon": "gift",
        "badge_color": "red",
    },
    ("low", 0): {
        "type": "upsell",
        "title": "프리미엄 서비스 업그레이드 제안",
        "description": "현재 요금제 대비 추가 혜택 안내 + 첫 달 무료 업그레이드 체험",
        "trigger_condition": "tenure 24개월 이상 + 추가 서비스 미이용",
        "icon": "star",
        "badge_color": "green",
    },
    ("low", 1): {
        "type": "contract_incentive",
        "title": "장기계약 전환 혜택 안내",
        "description": "1년 계약 전환 시 월 10% 할인 + 부가서비스 1개 무료 제공",
        "trigger_condition": "월간계약 + tenure 6~18개월",
        "icon": "star",
        "badge_color": "green",
    },
    ("low", 2): {
        "type": "loyalty_reward",
        "title": "장기 고객 감사 혜택",
        "description": "연간 이용 감사 리워드 + 신규 서비스 우선 체험 기회 제공",
        "trigger_condition": "tenure 24개월 이상 + 이탈 확률 50% 미만",
        "icon": "star",
        "badge_color": "green",
    },
    ("low", 3): {
        "type": "onboarding_guide",
        "title": "서비스 탐색 가이드 발송",
        "description": "미사용 서비스 안내 이메일 + 이용 팁 콘텐츠 발송",
        "trigger_condition": "tenure 12개월 미만 + 이탈 확률 50% 미만",
        "icon": "star",
        "badge_color": "green",
    },
}


def get_recommended_event(risk_level: str, cluster_id: int) -> dict:
    return ACTION_MAP.get((risk_level, cluster_id), ACTION_MAP[("low", 3)])


def classify_risk(prob: float) -> str:
    return "high" if prob >= 0.5 else "low"


def extract_risk_factors(row: dict) -> list:
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
    return factors[:3]


def predict_one(customer: dict) -> dict:
    tenure = float(customer.get('tenure', 0))
    total = float(customer.get('TotalCharges', 0))

    row = {
        'tenure':             tenure,
        'MonthlyCharges':     float(customer.get('MonthlyCharges', 0)),
        'TotalCharges':       total,
        'avg_monthly_spend':  total / tenure if tenure > 0 else 0,
        'PaymentMethod':      customer.get('PaymentMethod', ''),
        'OnlineSecurity':     customer.get('OnlineSecurity', ''),
        'TechSupport':        customer.get('TechSupport', ''),
        'StreamingTV':        customer.get('StreamingTV', ''),
        'StreamingMovies':    customer.get('StreamingMovies', ''),
        'SeniorCitizen':      int(customer.get('SeniorCitizen', 0)),
    }

    df_row = pd.DataFrame([row])[FEATURE_ORDER]
    prob = float(model.predict_proba(preprocessor.transform(df_row))[0][1])
    risk = classify_risk(prob)

    cluster_input = pd.DataFrame([[
        row['tenure'], row['MonthlyCharges'], row['TotalCharges'], row['avg_monthly_spend']
    ]], columns=CLUSTER_FEATURES)
    cluster_id = int(kmeans.predict(cluster_scaler.transform(cluster_input))[0])
    cluster_info = CLUSTER_LABELS[cluster_id]

    return {
        "customer_id":           customer.get('customer_id', ''),
        "churn_probability":     round(prob, 4),
        "risk_level":            risk,
        "cluster_id":            cluster_id,
        "cluster_name":          cluster_info["name"],
        "cluster_description":   cluster_info["description"],
        "cluster_color":         cluster_info["color"],
        "key_risk_factors":      extract_risk_factors(row),
        "recommended_event":     get_recommended_event(risk, cluster_id),
    }


@app.get('/health')
def health():
    return jsonify({"status": "ok"})


@app.post('/predict-single')
def predict_single():
    customer = request.get_json()
    if not customer:
        return jsonify({"error": "empty_body"}), 400
    return jsonify(predict_one(customer))


@app.post('/predict-batch')
def predict_batch():
    body = request.get_json()
    if not body or 'customers' not in body:
        return jsonify({"error": "missing_customers_field"}), 400

    results = [predict_one(c) for c in body['customers']]
    high = sum(1 for r in results if r['risk_level'] == 'high')

    cluster_distribution = {0: 0, 1: 0, 2: 0, 3: 0}
    for r in results:
        cluster_distribution[r['cluster_id']] += 1

    return jsonify({
        "results": results,
        "summary": {
            "total":                len(results),
            "high_risk":            high,
            "low_risk":             len(results) - high,
            "cluster_distribution": cluster_distribution,
        }
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

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

FEATURE_ORDER = [
    'tenure', 'MonthlyCharges', 'TotalCharges', 'avg_monthly_spend',
    'PaymentMethod', 'OnlineSecurity', 'TechSupport',
    'StreamingTV', 'StreamingMovies', 'SeniorCitizen'
]

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

    df = pd.DataFrame([row])[FEATURE_ORDER]
    prob = float(model.predict_proba(preprocessor.transform(df))[0][1])
    risk = classify_risk(prob)

    return {
        "customer_id":        customer.get('customer_id', ''),
        "churn_probability":  round(prob, 4),
        "risk_level":         risk,
        "key_risk_factors":   extract_risk_factors(row),
        "recommended_event":  EVENT_MAP[risk],
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

    return jsonify({
        "results": results,
        "summary": {
            "total":     len(results),
            "high_risk": high,
            "low_risk":  len(results) - high,
        }
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

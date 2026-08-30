const PYTHON_API_URL = (process.env.PYTHON_API_URL || '').replace(/^\uFEFF/, '').trim();

export const config = { maxDuration: 60 };

// 임계값별 정밀도/재현율 중계. 개입 기준선을 고르는 데 쓰인다.
export default async function handler(req, res) {
  if (!PYTHON_API_URL) {
    return res.status(500).json({ error: 'missing_python_api_url' });
  }

  try {
    const response = await fetch(`${PYTHON_API_URL}/model-metrics`);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 500) };
    }

    if (!response.ok) {
      return res.status(502).json({
        error: 'upstream_error',
        message: `예측 서버가 ${response.status}로 응답했습니다.`,
        upstream_status: response.status,
        upstream: data,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'model_metrics_failed', message: err.message });
  }
}

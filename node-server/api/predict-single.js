const PYTHON_API_URL = (process.env.PYTHON_API_URL || '').replace(/^\uFEFF/, '').trim();

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!PYTHON_API_URL) {
    return res.status(500).json({
      error: 'missing_python_api_url',
      message: 'PYTHON_API_URL 환경변수가 설정되지 않았습니다.',
    });
  }

  try {
    const response = await fetch(`${PYTHON_API_URL}/predict-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

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
    return res.status(500).json({ error: 'single_prediction_failed', message: err.message });
  }
}

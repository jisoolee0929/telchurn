const PYTHON_API_URL = (process.env.PYTHON_API_URL || '').replace(/^\uFEFF/, '').trim();

export const config = { maxDuration: 60 };

// 예측 서버 워밍업용. Render 무료 플랜은 15분 미사용 시 슬립하므로
// 대시보드 로드 시 1회 호출해 콜드 스타트를 미리 흡수한다.
export default async function handler(req, res) {
  if (!PYTHON_API_URL) {
    return res.status(500).json({ status: 'error', error: 'missing_python_api_url' });
  }

  try {
    const response = await fetch(`${PYTHON_API_URL}/health`);
    const ok = response.ok;
    return res.status(ok ? 200 : 502).json({
      status: ok ? 'ok' : 'upstream_error',
      upstream_status: response.status,
    });
  } catch (err) {
    return res.status(502).json({ status: 'unreachable', message: err.message });
  }
}

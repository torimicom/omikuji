export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API Key is missing in Vercel' });
  }

  try {
// 【変更後】自分のVercel APIを叩く（APIキーを画面に露出させない）
const response = await fetch('/api/fortune', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: prompt })
});

const data = await response.json();
const text = data.candidates[0].content.parts[0].text;
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

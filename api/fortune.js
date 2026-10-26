const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!apiKey || !supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Environment variables are missing on Vercel' });
  }

  try {
    const { category, question } = req.body || {};

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const randomLotNumber = Math.floor(Math.random() * 100) + 1;

    const { data: lotData, error: dbError } = await supabase
      .from('oracle_lots')
      .select('*')
      .eq('lot_number', randomLotNumber)
      .single();

    if (dbError || !lotData) {
      return res.status(500).json({ error: 'Failed to fetch lot from database: ' + (dbError?.message || 'Not found') });
    }

    // AIには「解釈・アドバイス部分」だけを生成させる簡潔なプロンプト
    const prompt = `
あなたは觀音靈籤（観音百籤）の熟練した解籤者です。
ユーザーの相談内容と、引き当てたおみくじのデータをもとに、心に寄り添う慈愛に満ちた現代向けの解釈とアドバイスを提供してください。

【相談情報】
- カテゴリ: ${category || '全般'}
- お悩み: ${question || '特になし'}

【引いた籤データ】
- 籤番号: 第${lotData.lot_number}籤 (${lotData.fortune})
- 宮位: ${lotData.palace}
- 籤名: ${lotData.title}
- 核心要約: ${lotData.summary}
- 現代語解釈: ${lotData.explanation_modern}
- 仙機（項目別吉凶）: ${JSON.stringify(lotData.divination_details)}

以下の構成で、マークダウン形式で解釈を出力してください：
1. **◆ 悩みに寄せた現在の状況と導き**
2. **◆ 項目別の指針**
3. **◆ 観音様からの温かいメッセージ**
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API Error' });
    }

    let aiText = '解釈を生成できませんでした。';
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      aiText = data.candidates[0].content.parts[0].text;
    }

    // データベースの全データ（漢詩含む）と、AIの解釈を両方返す
    return res.status(200).json({
      lot: lotData,
      aiResponse: aiText
    });

  } catch (err) {
    return res.status(500).json({ error: 'サーバーエラー: ' + err.message });
  }
};

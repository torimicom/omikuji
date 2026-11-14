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
    return res.status(500).json({ error: 'Vercelの環境変数が不足しています。' });
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
      return res.status(500).json({ error: '籤データの取得に失敗しました: ' + (dbError?.message || 'Not found') });
    }

    // 軽快かつ確実に書き切るための最適化されたプロンプト
    const prompt = `
あなたは觀音靈籤（観音百籤）の熟練した解籤者です。
以下の【引いた籤のデータ】と【相談者の情報】をもとに、心に染み入る丁寧な鑑定結果を出力してください。

【相談者の情報】
- カテゴリ: ${category || '全般'}
- お悩み・現状: ${question || '特になし'}

【引いた籤のデータ】
- 籤番号: 第${lotData.lot_number}籤 (${lotData.fortune}) - ${lotData.title}
- 核心要約: ${lotData.summary}
- 現代語解釈: ${lotData.explanation_modern}
- 仙機（項目別吉凶）: ${JSON.stringify(lotData.divination_details)}

以下の3つの構成で、美しく分かりやすいマークダウン形式で最後まで丁寧に出力してください：
1. **◆ 神意と現在の状況**（今の相談者の現状にこの卦象がどう作用しているか）
2. **◆ 悩みに寄せた具体的な導きとアドバイス**（具体的な心構えや行動指針）
3. **◆ 観音様からの結びのお言葉**（温かい励ましと締めくくり）

※重要：文章が途中で切れてしまわないよう、要点をすっきりとまとめ、必ず上記3項目を最後まで綺麗に書き切ってください。
※漢詩原文の重複記載は不要です。
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1500 // 途切れを防止しつつタイムアウトを防ぐ安全な上限値
          }
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

    return res.status(200).json({
      lot: lotData,
      aiResponse: aiText
    });

  } catch (err) {
    return res.status(500).json({ error: 'サーバーエラー: ' + err.message });
  }
};

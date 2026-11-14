const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // CORS ヘッダー設定
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

    // 1. Supabase 初期化
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 2. 1〜100 の中からランダムに1つ選ぶ
    const randomLotNumber = Math.floor(Math.random() * 100) + 1;

    // 3. oracle_lots テーブルから籤データを取得
    const { data: lotData, error: dbError } = await supabase
      .from('oracle_lots')
      .select('*')
      .eq('lot_number', randomLotNumber)
      .single();

    if (dbError || !lotData) {
      return res.status(500).json({ error: '籤データの取得に失敗しました: ' + (dbError?.message || 'Not found') });
    }

    // 4. プロンプトの構成
    const prompt = `
あなたは觀音靈籤（観音百籤）の厳かな神仏の代弁者であり、熟練した解籤者です。
引き当てたおみくじの卦象と、相談者の【お悩み】をもとに、心に染み入る慈愛と威厳に満ちた丁寧な鑑定結果を出力してください。

【相談者の情報】
- カテゴリ: ${category || '全般'}
- お悩み・現状: ${question || '特になし'}

【引き当てた籤の情報】
- 籤番号: 第${lotData.lot_number}籤 (${lotData.fortune})
- 籤名・典故: ${lotData.title}
- 核心要約: ${lotData.summary}
- 詩意: ${lotData.poem_meaning}
- 現代語解釈: ${lotData.explanation_modern}
- 仙機（項目別吉凶）: ${JSON.stringify(lotData.divination_details)}

以下の構成で、美しく分かりやすいマークダウン形式で丁寧に出力してください：
1. **◆ 神意と現在の状況**（今の相談者の現状に卦象がどう作用しているか深掘り）
2. **◆ 悩みに寄せた具体的な導きとアドバイス**（相談内容への具体的な心構えや行動指針）
3. **◆ 観音様からの結びのお言葉**（温かい励ましと締めくくり）

※各項目は要点をまとめ、途中で文章が切れないよう最後まで綺麗に書き切ってください。
※漢詩原文の引用は不要です（フロントエンド側で表示されます）。
`;

    // 5. 最も安定動作する標準モデル（gemini-1.5-flash）で Gemini API を呼び出し
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 1200
      }
    })
  }
);
    const rawText = await response.text();

let data;

try {
  data = JSON.parse(rawText);
} catch (e) {
  throw new Error(
    `API応答がJSONではありません。HTTP ${response.status}\n` +
    rawText.substring(0, 500)
  );
}

if (!response.ok) {
  throw new Error(data.error || '通信エラーが発生しました');
}

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API Error' });
    }

    // 6. 安全にAIの回答テキストを取り出す
    let aiText = '解釈を生成できませんでした。';
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      aiText = data.candidates[0].content.parts[0].text;
    } else if (data?.text) {
      aiText = data.text;
    } else {
      aiText = 'AIからの応答形式が予期せぬものでした。';
    }

    // 7. おみくじの基本データとAIの解釈を返却
    return res.status(200).json({
      lot: lotData,
      aiResponse: aiText
    });

  } catch (err) {
    return res.status(500).json({ error: 'サーバーエラー: ' + err.message });
  }
};

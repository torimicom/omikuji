const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // CORS 設定
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

    // 1. Supabase クライアントの初期化
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 2. 1〜100 の中からランダムに1つ番号を選ぶ
    const randomLotNumber = Math.floor(Math.random() * 100) + 1;

    // 3. Supabase の oracle_lots テーブルからその番号のデータを取得
    const { data: lotData, error: dbError } = await supabase
      .from('oracle_lots')
      .select('*')
      .eq('lot_number', randomLotNumber)
      .single();

    if (dbError || !lotData) {
      return res.status(500).json({ error: 'Failed to fetch lot from database: ' + (dbError?.message || 'Not found') });
    }

    // 4. 取得したおみくじデータと相談内容をまとめて Gemini に渡すプロンプトを作成
    const prompt = `
あなたは観音靈籤（観音百籤）の熟練した解籤者・霊媒師です。
ユーザーが引いたおみくじの結果と相談内容に基づき、慈愛と導きに満ちた深い解釈を提供してください。

【ユーザーの相談情報】
- 相談カテゴリ: ${category || '全般'}
- 相談内容: ${question || '特になし'}

【引き当てたおみくじデータ】
- 籤番号: 第${lotData.lot_number}籤 (${lotData.fortune})
- 宮位: ${lotData.palace}
- 籤名/故事: ${lotData.title}
- 核心要約: ${lotData.summary}
- 籤詩原文:\n${lotData.poem_original}
- 詩意: ${lotData.poem_meaning}
- 傳統解曰: ${lotData.explanation_original}
- 現代語解釈: ${lotData.explanation_modern}
- 仙機（項目別吉凶）: ${JSON.stringify(lotData.divination_details)}

以下の構成で美しく分かりやすくマークダウン形式で回答を出力してください：
1. **引き当てたおみくじの概要**（籤番号、吉凶、籤名、原文）
2. **現代における意味と解釈**（ユーザーの相談内容に寄り添った具体的なアドバイス）
3. **項目別の指針・アドバイス**（仙機データに基づく解説）
4. **観音様からのありがたいメッセージ（結び）**
`;

    // 5. Gemini API を呼び出す
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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

    // 安全にAIの回答テキストを取り出す
    let aiText = '解釈を生成できませんでした。';
    
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      aiText = data.candidates[0].content.parts[0].text;
    } else if (data?.text) {
      aiText = data.text;
    } else {
      aiText = 'AIからの応答形式が予期せぬものでした: ' + JSON.stringify(data);
    }

    return res.status(200).json({
      lot: lotData,
      aiResponse: aiText
    });

  } catch (err) {
    return res.status(500).json({ error: 'サーバーエラー: ' + err.message });
  }
};

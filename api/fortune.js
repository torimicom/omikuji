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

    // 4. Supabase から取得したおみくじデータとユーザーの悩みを組み合わせて、AIへのプロンプトを作成
    const prompt = `
あなたは觀音靈籤（観音百籤）の厳かな神仏の代弁者・熟練した解籤者です。
ユーザーが引き当てたおみくじのデータと相談内容をもとに、威厳と慈愛に満ちた深い解釈とアドバイスを提供してください。

【相談者の情報】
- 相談カテゴリ: ${category || '全般'}
- 相談内容: ${question || '特になし'}

【引き当てた籤の情報】
- 籤番号: 第${lotData.lot_number}籤 (${lotData.fortune})[cite: 3]
- 宮位: ${lotData.palace}[cite: 3]
- 籤名・典故: ${lotData.title}[cite: 3]
- 核心要約: ${lotData.summary}[cite: 3]
- 籤詩原文:
${lotData.poem_original}[cite: 3]
- 詩意: ${lotData.poem_meaning}[cite: 3]
- 傳統解曰: ${lotData.explanation_original}[cite: 3]
- 現代語解釈: ${lotData.explanation_modern}[cite: 3]
- 仙機（項目別吉凶）: ${JSON.stringify(lotData.divination_details)}[cite: 3]

以下の構成で、美しく分かりやすいマークダウン形式で回答を出力してください：
1. **◆ 神意・お諭し**（籤詩の雰囲気を交え、全体のメッセージを厳かに伝える）
2. **◆ 悩みに寄せた解釈**（ユーザーの相談内容に直接触れ、このおみくじが今の状況にどう作用しているか解説する）[cite: 3]
3. **◆ 項目別の指針・アドバイス**（仙機データや現代語解釈に基づく具体的な解説）[cite: 3]
4. **◆ 結び**（温かい締めくくりのメッセージ）
`;

    // 5. Gemini API を呼び出す（最新の推奨モデル指定）
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

    // 6. 安全にAIの回答テキストを取り出す（オプショナルチェイニングでエラーを防止）
    let aiText = '解釈を生成できませんでした。';
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      aiText = data.candidates[0].content.parts[0].text;
    } else if (data?.text) {
      aiText = data.text;
    } else {
      aiText = 'AIからの応答形式が予期せぬものでした: ' + JSON.stringify(data);
    }

    // 7. おみくじの基本データとAIの生成した解釈をまとめて返す
    return res.status(200).json({
      lot: lotData,
      aiResponse: aiText
    });

  } catch (err) {
    return res.status(500).json({ error: 'サーバーエラー: ' + err.message });
  }
};

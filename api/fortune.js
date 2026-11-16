
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // 1. CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. OPTIONSリクエストへの対応
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 3. POST以外は受け付けない
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'POSTメソッドのみ対応しています。'
    });
  }

  try {
    const totalStart = Date.now();
    // 4. 環境変数の確認
    const apiKey = process.env.GEMINI_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!apiKey || !supabaseUrl || !supabaseKey) {
      throw new Error(
        '環境変数が不足しています。GEMINI_API_KEY、SUPABASE_URL、SUPABASE_ANON_KEYを確認してください。'
      );
    }

    // 5. Supabaseに接続
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 6. リクエスト内容を取得
    const { category, question } = req.body || {};

    // 7. 1〜100からランダムに籤番号を選ぶ
    const randomLotNumber = Math.floor(Math.random() * 100) + 1;

    // 8. Supabaseから籤データを取得
    const { data: lotData, error: dbError } = await supabase
      .from('oracle_lots')
      .select('*')
      .eq('lot_number', randomLotNumber)
      .single();

    if (dbError) {
      throw new Error(
        '籤データの取得に失敗しました: ' + dbError.message
      );
    }

    if (!lotData) {
      throw new Error(
        '籤番号 ' + randomLotNumber + ' のデータが見つかりません。'
      );
    }
console.log('Supabase取得時間:', Date.now() - totalStart, 'ms');
const geminiStart = Date.now();
    // 9. Geminiに渡す解釈用プロンプト
    const prompt = `
あなたは観音霊籤の意味を、現代の人にも分かりやすく丁寧に解説する案内人です。

以下の籤の内容をもとに、相談者に寄り添った解釈をしてください。
原文の意味を尊重し、勝手に内容を変更したり、断定的な予言をしたりしないでください。

【相談者の相談カテゴリー】
${category || '全般'}

【相談者の質問】
${question || '特に指定なし'}

【籤の番号】
${lotData.lot_number}

【運勢】
${lotData.fortune || ''}

【籤の題名】
${lotData.title || ''}

【要約】
${lotData.summary || ''}

【詩の意味】
${lotData.poem_meaning || ''}

【現代語訳・解説】
${lotData.explanation_modern || ''}

【占いの詳細】
${lotData.divination_details || ''}

次の3つの項目に分けて、日本語で分かりやすく回答してください。

### 1. この籤が伝えていること
籤全体の意味や、今の相談者に向けられたメッセージを説明してください。

### 2. 今回の相談について
相談カテゴリーや質問に合わせて、籤の内容を具体的に解釈してください。

### 3. これから心がけること
日常生活で実践できる具体的な助言をしてください。

難しい仏教用語や古い表現は、必要に応じて簡単に説明してください。
穏やかで親しみやすい口調にしてください。
`;

    // 10. Gemini APIを呼び出す
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 1200
          }
        })
      }
    );

    // 11. Geminiの応答を読み取る
    const rawText = await response.text();
    console.log('Gemini応答時間:', Date.now() - geminiStart, 'ms');
    let data;

    try {
      data = JSON.parse(rawText);
    } catch (e) {
      throw new Error(
        `Geminiの応答がJSONではありません。HTTP ${response.status}: ` +
        rawText.substring(0, 500)
      );
    }

    // 12. Gemini APIのエラー確認
    if (!response.ok) {
      const errorMessage =
        data.error?.message ||
        JSON.stringify(data.error) ||
        'Gemini API Error';

      throw new Error(
        `Gemini API エラー（HTTP ${response.status}）: ${errorMessage}`
      );
    }

    // 13. AIの回答テキストを取り出す
    let aiText = '解釈を生成できませんでした。';

    const parts = data?.candidates?.[0]?.content?.parts;

    if (Array.isArray(parts)) {
      aiText = parts
        .map(part => part.text || '')
        .join('\n')
        .trim();

      if (!aiText) {
        aiText = 'AIから回答を取得できませんでした。';
      }
    }

    // 14. 籤データとAIの解釈を返す
    return res.status(200).json({
      lot: lotData,
      aiResponse: aiText
    });

  } catch (err) {
    console.error('fortune API error:', err);

    return res.status(500).json({
      error: 'サーバーエラー: ' + err.message
    });
  }
};

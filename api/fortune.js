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

    // Supabaseから詳細なフィールドをすべて取得
    const { data: lotData, error: dbError } = await supabase
      .from('oracle_lots')
      .select('*')
      .eq('lot_number', randomLotNumber)
      .single();

    if (dbError || !lotData) {
      return res.status(500).json({ error: '籤データの取得に失敗しました: ' + (dbError?.message || 'Not found') });
    }

    // AIへは「解釈・導き」の生成に専念させるプロンプト
    const prompt = `
あなたは觀音靈籤（観音百籤）の厳かな神仏の代弁者であり、熟練した解籤者です。
以下の【引いた籤のデータ】と【相談者の情報】をもとに、心に染み入る慈愛と威厳に満ちた丁寧な鑑定結果を出力してください。

【相談者の情報】
- カテゴリ: ${category || '全般'}
- お悩み・現状: ${question || '特になし'}

【引いた籤のデータ】
- 籤番号: 第${lotData.lot_number}籤 (${lotData.fortune}) - ${lotData.title}
- 核心要約: ${lotData.summary}
- 詩意: ${lotData.poem_meaning}
- 現代語解釈: ${lotData.explanation_modern}
- 仙機（項目別吉凶）: ${JSON.stringify(lotData.divination_details)}
- 相談別アドバイス: ${JSON.stringify(lotData.category_guidance || {})}

以下の構成で、美しく分かりやすいマークダウン形式で丁寧に出力してください：
1. **◆ 神意と現在の状況**（今の相談者の現状にこの卦象がどう作用しているか深掘り）
2. **◆ 悩みに寄せた具体的な導きとアドバイス**（相談内容への具体的な心構えや行動指針）
3. **◆ 観音様からの結びのお言葉**（温かい励ましと締めくくり）

※各項目は要点をまとめ、途中で文章が切れてしまうことがないよう、簡潔かつ丁寧に最後まで書き切ってください。
※漢詩原文や伝統的解曰の文字通りの再掲は不要です（フロントエンド側で別途表示されます）。
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1200 // 途切れを防止しつつタイムアウトを防ぐ安全な上限値
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

    // データベースの全詳細データ ＋ AIの解釈文をセットでフロントに返す
    return res.status(200).json({
      lot: lotData,
      aiResponse: aiText
    });

  } catch (err) {
    return res.status(500).json({ error: 'サーバーエラー: ' + err.message });
  }
};
```[cite: 1]

---

### フロントエンド側での表示のコツ
Supabase から送られてくる `data.lot` には以下の詳細データがすべて入っています。これをHTMLの専用エリアに割り当てることで、デザインされた美しい表示が可能になります[cite: 1, 3]。

* **漢詩原文**: `data.lot.poem_original`[cite: 3]
* **詩意（原典の背景）**: `data.lot.poem_meaning`[cite: 3]
* **傳統解曰**: `data.lot.explanation_original`[cite: 3]
* **現代語解釈**: `data.lot.explanation_modern`[cite: 3]
* **仙機（項目別吉凶）**: `data.lot.divination_details`[cite: 3]

データベースの準備と、今回のコードへの差し替えはいかがでしょうか？[cite: 1]

---

<ElicitationsGroup message="もしフロントエンドの表示方法や、データベースの特定の項目について追加の調整が必要な場合はこちらからどうぞ：">
  <Elicitation label="フロントエンドの表示コードも欲しい" query="Supabaseから返ってきたlotData（漢詩や解曰など）をフロントエンドのHTMLに綺麗に割り当てて表示するJavaScriptコードを教えてください。"/>
  <Elicitation label="データベースの項目を追加したい" query="supabaseのoracle_lotsテーブルに新しいカラムやデータを追加する方法を確認したいです。"/>
</ElicitationsGroup>

<FollowUp label="Want me to break down how to structure the frontend HTML template to display the poem and traditional explanations alongside the AI interpretation?" query="Yes, break down how to structure the frontend HTML template to display the poem and traditional explanations alongside the AI interpretation."/>

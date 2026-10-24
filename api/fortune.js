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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
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

    // 4. データベースにある詳細データを元に、見やすいマークダウン形式のメッセージを組み立てる
    const aiResponseText = `
### 第${lotData.lot_number}籤 (${lotData.fortune}) - ${lotData.title}
- **宮位**: ${lotData.palace}[cite: 3]
- **核心要約**: ${lotData.summary}[cite: 3]

#### 【 籤詩原文 】
\`\`\`
${lotData.poem_original}
\`\`\`[cite: 3]

#### 【 詩意 】
${lotData.poem_meaning}[cite: 3]

#### 【 傳統解曰 】
${lotData.explanation_original}[cite: 3]

#### 【 現代語解釈 】
${lotData.explanation_modern}[cite: 3]

#### 【 仙機（項目別吉凶） 】
\`\`\`json
${JSON.stringify(lotData.divination_details, null, 2)}
\`\`\`[cite: 3]
`;

    // 5. Supabaseから取得したデータをそのままフロントエンドに返す
    return res.status(200).json({
      lot: lotData,
      aiResponse: aiResponseText
    });

  } catch (err) {
    return res.status(500).json({ error: 'サーバーエラー: ' + err.message });
  }
};

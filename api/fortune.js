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

    // 4. ユーザーのお悩み（question）が入力されている場合の寄り添いメッセージ
    const userContext = question 
      ? `\n\n### 💡 您的相談・現状\n- **類別**: ${category || '全般'}\n- **内容**: 「${question}」\n\n> 観音様のお告げは、今のあなたの歩みに静かに寄り添っています。焦らず、この籤の教えを心にお留めください。` 
      : '';

    // 5. Supabase のデータをもとに、見事なおみくじ解説文を組み立てる（AI不使用・完全安定）
    const formattedResponse = `
### 🌿 神意と現在の状況
${lotData.explanation_modern}${userContext}

#### 【 籤詩原文 】
${lotData.poem_original}

#### 【 詩意 】
${lotData.poem_meaning}

### 🔮 項目別の指針・アドバイス
- **家宅 / 自身**: ${lotData.divination_details?.家宅 || '平穏無事'}, ${lotData.divination_details?.自身 || '順調'}
- **求財 / 交易**: ${lotData.divination_details?.求財 || '時機を待つ'}, ${lotData.divination_details?.交易 || '慎重に'}
- **婚姻 / 六甲**: ${lotData.divination_details?.婚姻 || '縁を大切に'}, ${lotData.six_jia || lotData.divination_details?.六甲 || '安泰'}

### ✨ 観音様からの温かいメッセージ
物事にはすべて正しいタイミングがあります。心を穏やかに保ち、目の前のなすべきことに誠実に向き合うことで、自ずと道は開かれていきます。
`;

    // 6. データをフロントエンドに返す
    return res.status(200).json({
      lot: lotData,
      aiResponse: formattedResponse
    });

  } catch (err) {
    return res.status(500).json({ error: 'サーバーエラー: ' + err.message });
  }
};
```[cite: 1]

---

このコードに変更していただければ、Googleのサーバー混雑や制限に怯える必要が一切なくなり、**ボタンを押した瞬間にサクサク快適におみくじが引ける状態**になります。ぜひ試してみてくださいね！

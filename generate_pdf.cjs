const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ size: 'A4', margin: 50 });
const outputPath = path.join(__dirname, 'public', 'excel_import_guide.pdf');
const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

const FONT = 'C:/Windows/Fonts/yumin.ttf';
const LEFT = 50;
const RIGHT = 545;
const WIDTH = RIGHT - LEFT;

function heading(text) {
  doc.moveDown(0.5);
  doc.font(FONT, 16).fillColor('#000').text(text, LEFT, doc.y, { width: WIDTH });
  doc.moveTo(LEFT, doc.y + 2).lineTo(RIGHT, doc.y + 2).strokeColor('#333').lineWidth(1).stroke();
  doc.moveDown(0.5);
}

function body(text, opts = {}) {
  doc.font(FONT, 11).fillColor('#333').text(text, LEFT, doc.y, { width: WIDTH, lineGap: 5, ...opts });
}

// ---- タイトル ----
doc.font(FONT, 24).fillColor('#000').text('Excelで一括ルール登録', LEFT, 50, { width: WIDTH, align: 'center' });
doc.moveDown(0.3);
doc.font(FONT, 12).fillColor('#666').text('メール2チャットワークJP マニュアル', LEFT, doc.y, { width: WIDTH, align: 'center' });
doc.moveDown(1.5);

// ---- 概要 ----
heading('概要');
body(
  '大量の転送ルールを一度に登録したい場合、Excelファイル（.xlsx）でインポートできます。\n' +
  '転送ルール画面の「Excelインポート」ボタンからファイルを選択するだけで登録されます。'
);
doc.moveDown(1);

// ---- Excelフォーマット ----
heading('Excelのフォーマット（5列）');
doc.moveDown(0.3);

// テーブル描画
const tableX = LEFT;
const colWidths = [90, 115, 115, 100, 100];
const totalW = colWidths.reduce((a, b) => a + b, 0);
const headers = ['A列: ルール名', 'B列: 受信\nメールアドレス', 'C列: 相手\nメールアドレス', 'D列: 受信件名\n（部分一致）', 'E列: チャットワーク\nルームID'];
const row1 = ['注文通知', 'shop@example.com', '@amazon.co.jp', '注文', '123456789'];
const row2 = ['全メール転送', 'info@example.com', '（空欄）', '（空欄）', '987654321'];

function drawRow(y, data, height, bgColor, fontSize, fontColor) {
  let x = tableX;
  data.forEach((cell, i) => {
    doc.rect(x, y, colWidths[i], height).fill(bgColor).stroke('#bbb');
    const color = (cell === '（空欄）') ? '#999' : fontColor;
    doc.font(FONT, fontSize).fillColor(color).text(cell, x + 5, y + 5, { width: colWidths[i] - 10, align: 'center' });
    x += colWidths[i];
  });
}

const tY = doc.y;
drawRow(tY, headers, 36, '#e8e8e8', 9, '#000');
drawRow(tY + 37, row1, 24, '#fff', 9, '#000');
drawRow(tY + 62, row2, 24, '#f8f8f8', 9, '#000');

// テーブル後にy位置をリセット
doc.x = LEFT;
doc.y = tY + 95;
doc.moveDown(1);

// ---- 各列の説明 ----
heading('各列の説明');

const descs = [
  ['A列: ルール名（必須）', 'ルールの名前。分かりやすい名前を付けてください。'],
  ['B列: 受信メールアドレス', '監視対象のメールアドレス。空欄または「全アカウント」にすると、登録済みの全アカウントが対象になります。'],
  ['C列: 相手メールアドレス', 'メール送信者の絞り込み条件（部分一致）。例:「@amazon.co.jp」→ Amazonからのメールだけ転送。空欄にすると全ての送信者が対象になります。'],
  ['D列: 受信件名（部分一致）', 'メール件名の絞り込み条件（部分一致）。例:「注文」→ 件名に「注文」を含むメールだけ転送。空欄にすると全ての件名が対象になります。'],
  ['E列: チャットワークルームID（必須）', '転送先のChatworkルームのID（数字）。アプリの「ルーム一覧」画面で確認できます。'],
];

descs.forEach(([title, desc]) => {
  doc.font(FONT, 11).fillColor('#0055aa').text(title, LEFT, doc.y, { width: WIDTH });
  doc.font(FONT, 10).fillColor('#333').text(desc, LEFT + 20, doc.y, { width: WIDTH - 20, lineGap: 3 });
  doc.moveDown(0.5);
});

doc.moveDown(0.5);

// ---- 手順 ----
heading('インポート手順');

const steps = [
  '上のフォーマットに従って、Excelファイル（.xlsx）を作成する',
  'アプリにログインし、「転送ルール」画面を開く',
  '「Excelインポート」ボタンをクリック',
  'ファイルを選択すると、自動でルールが登録されます',
];
steps.forEach((s, i) => {
  doc.font(FONT, 11).fillColor('#000').text(`${i + 1}.  ${s}`, LEFT, doc.y, { width: WIDTH, lineGap: 4 });
});
doc.moveDown(1);

// ---- 注意事項 ----
heading('注意事項');

const notes = [
  'C列（相手メールアドレス）とD列（件名）が両方空欄の場合、全メール転送になります。',
  '既存ルールのバックアップは「Excelエクスポート」ボタンで取れます。',
  'インポートは追加のみです。既存のルールは削除されません。',
  'チャットワークルームIDは「ルーム一覧」画面で確認してください。',
  '1行目はヘッダー行（列名）にしてください。2行目からデータです。',
];
notes.forEach(n => {
  doc.font(FONT, 10).fillColor('#333').text(`・ ${n}`, LEFT, doc.y, { width: WIDTH, lineGap: 3 });
  doc.moveDown(0.2);
});

doc.end();
stream.on('finish', () => {
  console.log('PDF generated:', outputPath);
});

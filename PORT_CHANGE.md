# ポート番号の変更方法

## 現在使用中のポートを確認

### Windows
```bash
netstat -ano | findstr :3000
netstat -ano | findstr :3001
```

## ポート番号を変更

### 方法1: .env ファイルで変更（推奨）

1. `.env` ファイルを作成（なければ）
```bash
cp .env.example .env
```

2. `.env` を編集
```env
PORT=8080
```

3. アプリを再起動
```bash
npm start
```

### 方法2: 起動時に指定

```bash
PORT=8080 npm start
```

## おすすめのポート番号

- `3001` - デフォルト
- `8080` - 一般的なWeb開発用
- `8000` - Python系と競合しない
- `5000` - その他の選択肢

## アクセスURL

ポートを変更した場合のアクセスURL：

- `http://localhost:3001` - デフォルト
- `http://localhost:8080` - ポート8080に変更した場合
- `http://localhost:8000` - ポート8000に変更した場合

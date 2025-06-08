了解。
以下、\*\*satopon仕様書に基づく「MongoDBスキーマ案」と「RESTful API設計（FastAPI想定）」\*\*を分かりやすくまとめます。
APIは堅実な命名・構造、冗長性の排除、引数やリクエスト例・レスポンス例・説明を明記します。

---

````markdown
# satopon MongoDB Schema & API Design

---

## 1. MongoDB Schema 設計

### 1.1 users コレクション

| フィールド        | 型           | 必須 | 説明                     |
|-------------------|--------------|------|--------------------------|
| _id               | ObjectId     | Yes  | MongoDB標準ID            |
| user_id           | string       | Yes  | BaaSのID（sub）           |
| display_name      | string       | Yes  | ユーザー表示名           |
| email             | string       | Yes  | メールアドレス           |
| icon_url          | string       | No   | プロフィール画像URL      |
| registered_at     | datetime     | Yes  | 登録日時                 |
| is_deleted        | bool         | No   | 論理削除フラグ           |

### 1.2 rooms コレクション

| フィールド        | 型           | 必須 | 説明                   |
|-------------------|--------------|------|------------------------|
| _id               | ObjectId     | Yes  | MongoDB標準ID          |
| room_id           | string       | Yes  | UUID                   |
| name              | string       | Yes  | ルーム名               |
| description       | string       | No   | 説明                   |
| color_id          | int          | Yes  | 色ID（単色, 例: 0=青） |
| created_by        | string       | Yes  | 作成者user_id          |
| created_at        | datetime     | Yes  | 作成日時               |
| is_archived       | bool         | No   | 論理削除フラグ         |
| members           | [MemberObj]  | Yes  | メンバー配列           |

**MemberObj**

| フィールド   | 型     | 必須 | 説明                 |
|--------------|--------|------|----------------------|
| user_id      | string | Yes  | ユーザーID           |
| joined_at    | datetime | Yes | 参加日時             |

### 1.3 point_records コレクション

| フィールド      | 型           | 必須 | 説明                       |
|-----------------|--------------|------|----------------------------|
| _id             | ObjectId     | Yes  | MongoDB標準ID              |
| room_id         | string       | Yes  | 対象ルームID               |
| round_id        | string       | Yes  | ゲーム単位のUUID           |
| points          | [PointObj]   | Yes  | ユーザーごとのポイント記録 |
| created_at      | datetime     | Yes  | 記録日時                   |
| approved_by     | [string]     | Yes  | 承認したuser_id配列         |
| is_deleted      | bool         | No   | 論理削除                   |

**PointObj**

| フィールド   | 型     | 必須 | 説明             |
|--------------|--------|------|------------------|
| user_id      | string | Yes  | ユーザーID       |
| value        | int    | Yes  | 加減ポイント     |

### 1.4 settlements コレクション

| フィールド      | 型           | 必須 | 説明                   |
|-----------------|--------------|------|------------------------|
| _id             | ObjectId     | Yes  | MongoDB標準ID          |
| room_id         | string       | Yes  | 対象ルームID           |
| from_user_id    | string       | Yes  | 支払う側ユーザーID     |
| to_user_id      | string       | Yes  | 受け取る側ユーザーID   |
| amount          | int          | Yes  | 精算ポイント           |
| approved        | bool         | Yes  | 受け手の承諾状態       |
| created_at      | datetime     | Yes  | 精算作成日時           |
| approved_at     | datetime     | No   | 承諾日時               |
| is_deleted      | bool         | No   | 論理削除               |

---

## 2. RESTful API 設計

### 共通事項

- 認証：全APIでJWT等による認証必須
- レスポンス形式：`application/json`
- エラー時は適切なHTTPステータスとメッセージ返却

---

### 2.1 ユーザーAPI

#### [POST] /api/users
**説明**: 新規ユーザー登録（認証後に呼び出し。二重登録は不可）

**リクエスト例**
```json
{
  "user_id": "auth0|xxxx",
  "display_name": "Taro",
  "email": "taro@example.com",
  "icon_url": "https://...",
}
````

**レスポンス例**

```json
{
  "user_id": "auth0|xxxx",
  "display_name": "Taro",
  "email": "taro@example.com"
}
```

---

#### \[GET] /api/users/me

**説明**: ログイン中ユーザー自身の情報取得

**レスポンス例**

```json
{
  "user_id": "auth0|xxxx",
  "display_name": "Taro",
  "email": "taro@example.com",
  "icon_url": "https://...",
  "registered_at": "2024-06-01T00:00:00Z"
}
```

---

#### \[PUT] /api/users/me

**説明**: display\_nameの更新

**リクエスト例**

```json
{
  "display_name": "Nogi"
}
```

**レスポンス例**

```json
{
  "ok": true
}
```

---

#### \[GET] /api/users

**説明**: 全ユーザー一覧＋オンライン状態（オプション: ?with\_online=1）

**レスポンス例**

```json
[
  {
    "user_id": "auth0|xxx1",
    "display_name": "A",
    "icon_url": "...",
    "is_online": true
  },
  {
    "user_id": "auth0|xxx2",
    "display_name": "B",
    "icon_url": "...",
    "is_online": false
  }
]
```

---

### 2.2 ルームAPI

#### \[POST] /api/rooms

**説明**: ルーム作成

**リクエスト例**

```json
{
  "name": "C402",
  "description": "ゲーム部屋",
  "color_id": 0
}
```

**レスポンス例**

```json
{
  "room_id": "room-uuid-1",
  "name": "C402"
}
```

---

#### \[GET] /api/rooms

**説明**: ルーム一覧取得（自分がメンバーのルームのみ）

**レスポンス例**

```json
[
  {
    "room_id": "room-uuid-1",
    "name": "C402",
    "members": [ { "user_id": "..." }, ... ],
    "is_archived": false
  }
]
```

---

#### \[GET] /api/rooms/{room\_id}

**説明**: ルーム詳細情報取得

---

#### \[PUT] /api/rooms/{room\_id}

**説明**: ルーム編集（作成者のみ）

**リクエスト例**

```json
{
  "name": "C402リニューアル",
  "description": "新しい説明",
  "color_id": 1
}
```

---

#### \[DELETE] /api/rooms/{room\_id}

**説明**: ルーム論理削除（全員のポイント0ならのみ）

---

### 2.3 ルーム参加・退会API

#### \[POST] /api/rooms/{room\_id}/join

**説明**: ルーム参加申請
WebSocketで「承認待ち」をリアルタイム通知

---

#### \[POST] /api/rooms/{room\_id}/approve

**説明**: ルーム参加申請承認
（承認ユーザーのみ）

**リクエスト例**

```json
{
  "applicant_user_id": "auth0|yyy"
}
```

---

#### \[POST] /api/rooms/{room\_id}/reject

**説明**: ルーム参加申請拒否
（承認ユーザーのみ）

---

#### \[POST] /api/rooms/{room\_id}/leave

**説明**: ルーム退会（自分のポイント0時のみ）

---

### 2.4 ポイント登録・履歴API

#### \[POST] /api/rooms/{room\_id}/points

**説明**: ポイント登録・記録開始（全員入力後、全員承認で履歴化）

**リクエスト例**

```json
{
  "points": [
    { "user_id": "xxx", "value": 50 },
    { "user_id": "yyy", "value": -50 }
  ]
}
```

---

#### \[GET] /api/rooms/{room\_id}/points/history

**説明**: ルームごとの履歴取得

---

#### \[DELETE] /api/rooms/{room\_id}/points/{round\_id}

**説明**: ポイント履歴論理削除（管理者のみ）

---

### 2.5 精算API

#### \[POST] /api/rooms/{room\_id}/settle

**説明**: 精算申請

**リクエスト例**

```json
{
  "to_user_id": "xxx",
  "amount": 30
}
```

---

#### \[POST] /api/rooms/{room\_id}/settle/{settlement\_id}/approve

**説明**: 精算承諾

---

#### \[GET] /api/rooms/{room\_id}/settle/history

**説明**: 精算履歴取得

---

## 備考

* 各APIの引数・レスポンスは設計フェーズで都度詳細化
* WebSocketイベントはAPI設計に従い随時仕様化
* 論理削除は `is_deleted` / `is_archived` フラグ
* 各APIは認証・権限制御・エラーハンドリング徹底

---

**設計の指摘・追加要件・具体的なAPI例（リクエスト/レスポンス）を要望すれば追記可能。**

```
本設計は2025/06時点の要件・仕様に即して構成。  
細部の権限・バリデーション・ユースケースは更に要件追加のたび明文化を推奨。
```


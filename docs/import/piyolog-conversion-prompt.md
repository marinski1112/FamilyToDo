# ぴよログPDF → FamilyToDo 変換用プロンプト

このファイルの「ここから」以降を、PDFを添付した別のChatGPTの会話へ貼り付けてください。PDFの変換はこの会話で行います。FamilyToDoには完成したJSONと画像ファイルを取り込みます。

## ここから

添付のぴよログPDFを、以下のFamilyToDoの実装済み形式に変換してください。推測で記録を補完せず、PDFに確認できる内容だけを扱ってください。まず全ページの種類と対象期間を確認してから変換し、最後に欠落・重複を確認してください。

目的は、日常の育児ログ、離乳食、成長日記の文章と写真、食材リストの一括移行です。身長・体重・成長曲線は今回は除外してください。PDFに含まれない機能のデータは作らないでください。

### 納品物

- UTF-8のJSONファイル。子供ごとに分け、1ファイル200ログ以下・食材100件以下・写真指定200件以下・3MB未満。超える場合は連番で分割してください。食材のみのファイルも可です。
- JPEG/PNG/WebPの実画像ファイル。ZIPにもまとめ、ZIPを解凍してJSONと画像を選択すればよい状態にしてください。ZIPそのものはアプリに取り込めません。
- 変換結果レポート。対象の子供、期間、ページ範囲、種類別件数、日記件数、食材件数、写真件数、除外した測定値、読めなかった箇所、手動確認が必要な内容を短く記載してください。
- ファイルを実際に生成してください。実行環境がなく画像抽出やファイル作成ができない場合は、その点を明示し、完成したふりをしないでください。

### JSONの外形

```json
{
  "format": "familytodo-family-log-import-v1",
  "source": "piyolog",
  "records": [],
  "foods": [],
  "piyolog_media": []
}
```

`records`は必須です。食材のみの場合は空配列にします。`foods`と`piyolog_media`はなければ空配列。family_id・subject_id・member_id・DBのid・CSRF・token・保存URLは含めません。取込先の子供はアプリで選択します。

### 日常ログ

各レコードのフィールドは次のとおりです。未記載の数値や区分はnullにし、0を推測で入れません。

```json
{
  "external_id": "child1-p003-r012",
  "occurred_at": "2026-08-21T08:30:00+09:00",
  "log_type": "MILK",
  "detail_code": null,
  "amount": 160,
  "unit": "ml",
  "duration_minutes": null,
  "value_text": null,
  "note": null,
  "source_text": "8:30 ミルク 160ml",
  "source_page": 3
}
```

- external_idは子供・ページ・掲載順から安定したIDにし、全分割ファイルを通じて一意にしてください。同じPDFの再変換でも同じIDにします。
- occurred_atはPDFの現地時刻を保ち、日本時間なら必ず`+09:00`を付けます。UTCへの誤変換をしません。日付不明の通常ログは要確認へ回します。
- 時刻のない成長日記は当日12:00:00+09:00に統一し、noteに「原本は日付のみ」と記載します。日付さえ不明なら取込対象にせず要確認へ回します。
- value_textは255文字以内（日記のタイトルは120文字以内）、noteは2000文字以内、source_textは4000文字以内、external_idは255文字以内。超過分を黙って切り捨てず、別ファイルに全文を残してレポートに記載します。
- source_pageはPDFの1始まりのページ番号です。source_textには対応する原文を保持します。日次・月次合計を個別ログと重複登録しません。

| 原本の記録 | log_type | detail_code | 数値など |
| --- | --- | --- | --- |
| ミルク | MILK | null | amount=ml数、unit="ml" |
| 母乳 | BREASTFEED | LEFT / RIGHT / BOTH / null | duration_minutes=明記された分数、unit=null |
| 離乳食 | MEAL | BABY_FOOD | 食材・食べた量などをvalue_text/noteに保持 |
| 通常の食事 | MEAL | BREAKFAST / LUNCH / DINNER / SNACK / OTHER / null | 本文をvalue_text/noteに保持 |
| おしっこ | DIAPER | WET | 数値はnull |
| うんち | DIAPER | DIRTY | 数値はnull |
| 両方を同時に記録 | DIAPER | BOTH | 別々の記録なら勝手に統合しない |
| 睡眠 | SLEEP | null | 入眠時刻、判明する場合だけduration_minutes |
| お風呂 | BATH | BATH / SHOWER / null | 本文はnote |
| 体温 | TEMPERATURE | null | amount=体温、unit="℃" |
| 薬 | MEDICINE | null | 薬名・服用量はvalue_text/note。amount/unitはnull |
| 予防接種 | VACCINE | null | 本文をvalue_text/note |
| 吐いた | CONDITION | VOMIT | 本文をnote |
| その他の体調 | CONDITION | null | 本文をvalue_text/note |
| その他の通常メモ | MEMO | null | 本文をvalue_text/note |

睡眠の開始・終了が対応できる場合は1件にまとめ、終了を別の睡眠として数えません。日付をまたぐ場合も実際の開始日を維持します。対応できない終了時刻などは要確認へ回します。duration_minutesは整数0〜10080の範囲です。

### 成長日記・成長の文章

PDFの日記欄や「立った」「ママと言った」等の成長記録は、次の形式にします。通常ログと成長日記へ二重に作らず、1レコードだけ作ってください。このレコードが両方の画面に表示されます。

```json
{
  "external_id": "child1-p025-diary01",
  "occurred_at": "2026-08-21T12:00:00+09:00",
  "log_type": "MEMO",
  "detail_code": "JOURNAL_MEMO",
  "journal": true,
  "amount": null,
  "unit": null,
  "duration_minutes": null,
  "value_text": "笑い返してくれた",
  "note": "原文の文章をここへ保持。原本は日付のみ。",
  "source_text": "対応する原文",
  "source_page": 25
}
```

タイトルは原文から120文字以内で簡潔に作成し、文章はnoteに保持します。新しい出来事や解釈を付け足さないでください。測定値の専用形式や未実装のmilestoneフィールドは作りません。日記インポートからGoogleカレンダーへ自動送信はされません。

### 食材リスト

```json
{
  "name": "にんじん",
  "category": "VEGETABLE",
  "first_tried_on": "2026-08-21",
  "stages": ["INITIAL", "MIDDLE"]
}
```

このオブジェクトをトップレベルのfoods配列に入れます。

- nameは80文字以内。子供ごとに同名食材を1件にまとめ、表記の揺れは原文を確認してから統一します。
- categoryはGRAIN（炭水化物）、VEGETABLE（野菜）、FRUIT（くだもの）、MEAT（肉）、FISH（魚）、OTHER（その他）のいずれか。分類が不明ならOTHER。
- first_tried_onは初回日をYYYY-MM-DDで記録。不明ならnull。推測した日付や未来日を入れません。
- stagesはINITIAL（初期）、MIDDLE（中期）、LATE（後期）、COMPLETE（完了期）の配列。原本で記録が確認できた段階のみ指定。不明なら[]。月齢から推測せず、「食べてもよい」という推奨段階と「実際に記録された段階」を混同しません。
- 通常の食事本文に食材名があるだけでは、正確な初回日や段階を断定しません。
- アレルギー印・反応・分類できない記号等は現行の食材テーブルでは表現できないため、消さずに要確認レポートへ記載します。医学的判断は加えません。
- アプリに同名食材がある場合、インポートはその食材を上書きしません。既存データを更新したい場合は一覧で編集するか、ユーザー自身が削除対象を確認してから再取込します。

### 写真

トップレベルpiyolog_mediaで、上記recordsのexternal_idと画像ファイル名を結びます。

```json
[
  {"external_id": "child1-p025-diary01", "file_name": "child1-p025-diary01.jpg"}
]
```

- 添付可能なのはMEAL/BABY_FOOD、またはjournal=trueのMEMO/JOURNAL_MEMOのレコードです。
- PDF内の実写真を抽出してください。写真がない場所に画像を生成したり、URLだけを作ったりしないでください。別の生成AI・画像解析サービスには送信しないでください。
- 1記録に1画像です。同じ日記に複数写真がある場合は、Python等で元の写真だけを1枚に配置したコラージュを作り、結合したことをレポートに記載してください。異なる日付や出来事の写真を混ぜません。
- ファイル名はASCIIの英数字・ハイフン・拡張子を使い、一意にします。ディレクトリ名やスラッシュをfile_nameに含めません。
- JSONへのbase64埋め込み、非公開ストレージキー、認証情報は不要です。
- 写真と本文の対応が不明な場合は、写真を別ファイルとして保持して要確認へ回します。誤った記録へ添付しません。
- 抽出画像は20MB以下のJPEG/PNG/WebPにします。可能なら最大辺800px程度のJPEGにしてEXIFを除去してください。アプリも端末内で縮小・JPEG変換します。
- PDFページ全体を写真として代用せず、対応する写真部分を抽出してください。抽出できないものは欠落件数として明示してください。

### 最終検証

納品前にJSON.parse等で全ファイルを機械検証し、外形・文字数・enum・日付・分割件数・external_id一意性・画像の実在・画像対応・食材名重複を確認してください。写真指定のIDは同じJSONのrecords内に存在する必要があります。

原本の日記一覧・食材一覧がそもそもPDFに収録されていない場合は、その事実を明示してください。ログ本文だけから架空の一覧を復元しないでください。未対応項目や不明箇所を黙って捨てず、要確認レポートへまとめてください。

最後に、作成した各ファイルへのダウンロードリンクと、子供ごとの取込順序を示してください。アプリへの接続・既存データ削除・インポート実行は不要です。

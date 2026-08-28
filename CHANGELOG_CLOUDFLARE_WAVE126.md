# Family TODO Cloudflare Wave126 — 12.145.0-wave126

## Service Account / HomeGraph Request Sync

`GOOGLE_HOME_SERVICE_ACCOUNT_JSON` には、Google Cloud からダウンロードした JSON key file の raw text を、最初の `{` から最後の `}` まで全部貼り付けます。`GOOGLE_HOME_SERVICE_ACCOUNT_JSON=` prefix、single quote、backtick、Markdown code fence、JSON filename、`private_key`/`private_key_id` だけ、Base64 は使用しません。

元の raw JSON file では `"private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"` のように newline が JSON escape されています。rich text app で加工せず、元ファイルの raw text を利用してください。前後 whitespace と UTF-8 BOM、および誤って一度 JSON-stringify された JSON は受理しますが、Base64 等は推測しません。

ローカル診断は JSON、必須 field、PKCS8 PEM、Web Crypto private-key import を段階検証し、credential値は表示・log出力しません。Request Sync はローカル検証成功後にだけ JWT assertion → OAuth access token → HomeGraph API の順で通信します。この実装の HomeGraph Request Sync に Google API key は不要です。

## Timestamp policy

A. task dates と Family Log `occurred_at` は domain wall-clock です。B. activity log、sync、retry timestamp は UTC-naive SQL text で保存します。B だけを表示時に family timezone (`family_timezone` → `APP_TIMEZONE` → `Asia/Tokyo`) へ変換します。保存、sort、retention query は UTC のままで、migration はありません。

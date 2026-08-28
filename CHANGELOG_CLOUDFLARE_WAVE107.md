# Wave107 — Family AI の安全な書き込み操作

## Architecture

Family AI now produces either a read plan or one of seven typed write actions. Writes stop at a deterministic preview. A 10-minute HMAC-SHA-256 confirmation token binds the family, member, provider, action, normalized arguments, timestamps, and nonce. Execute verifies CSRF, authorization, signature, expiry, and family/member binding without contacting Gemini or Workers AI.

## Safety and integration

The allowlist contains task/event creation, task completion, quick-chore and safe Family Log recording, and the existing child/baby sleep timer start/stop. Delete, member, permission, settings, Google connection, import, and bulk actions are rejected. Event/task projection uses the existing Google Calendar outbox helper. A nonce receipt makes successful retries deterministic and activity audit metadata stores only action/provider/target—not the original question.

## Operations

Migration `0035_wave107_family_ai_actions.sql` adds the minimal receipt table. Planning uses at most one inference; confirmation, execution, Calendar synchronization, and exact local read plans use zero. Write target resolution is bounded and remains inside D1; raw task/log lists are never sent to the provider.

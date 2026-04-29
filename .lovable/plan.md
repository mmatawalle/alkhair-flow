## Goal
Deploy the existing `ai-draft-assistant` edge function so the frontend can call it successfully.

## Current state
- Code exists at `supabase/functions/ai-draft-assistant/index.ts` (verified — full implementation with OpenAI call, JSON schema extraction, CORS handling, auth check).
- Secret `OPENAI_API_KEY` is already configured in Lovable Cloud.
- Only `admin-manage-users` is currently deployed in your Supabase project.
- The DB migration for `ai_drafts` is already applied.
- Frontend calls `supabase.functions.invoke("ai-draft-assistant", ...)` and currently fails with "Failed to send a request to the Edge Function" because the function isn't deployed.

## Plan

### 1. Verify CORS headers in the existing code
The current file has:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```
It does NOT explicitly set `Access-Control-Allow-Methods`. I'll add `Access-Control-Allow-Methods: POST, OPTIONS` to match your spec and prevent any preflight edge cases.

### 2. Deploy the function
Use Lovable's deploy tool to push `ai-draft-assistant` to your Supabase project. This will make it appear alongside `admin-manage-users` in Cloud → Edge Functions.

### 3. Verify deployment
- Check edge function logs to confirm the function booted and `OPENAI_API_KEY` is visible.
- Optionally make a test `curl` call to `/functions/v1/ai-draft-assistant` (OPTIONS + a small POST) to confirm reachability and CORS.

### 4. Confirm to you
Report back the deployment status, log output, and whether the endpoint responds correctly. After this you should be able to retry the action in your app and it should succeed.

## Notes
- No DB changes needed.
- No frontend changes needed — your existing `supabase.functions.invoke("ai-draft-assistant", ...)` call will work as-is once deployed.
- The function uses `verify_jwt = false` defaults but validates the user's JWT in code (returns 401 if missing), which is correct.
- If you'd like to also set `OPENAI_DRAFT_MODEL` (defaults to `gpt-4o-mini`), tell me which model and I'll add the secret.

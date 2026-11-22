import {createHandler} from './handler.js';

const get = (key: string) => Deno.env.get(key);
Deno.serve(createHandler({
  config:{
    project:get('SUPABASE_URL'),
    anon:get('SUPABASE_ANON_KEY'),
    service:get('SUPABASE_SERVICE_ROLE_KEY'),
    key:get('GEMINI_API_KEY'),
    model:get('GEMINI_MODEL'),
    freeConfirmed:get('GEMINI_FREE_TIER_CONFIRMED'),
    allowed:new Set((get('N5_TRANSLATION_ALLOWED_USERS') || '').split(',').map(id => id.trim()).filter(Boolean)),
  },
}));

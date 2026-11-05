import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://pisrqnrupmpjvonlbxmg.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpc3JxbnJ1cG1wanZvbmxieG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDc1MDEsImV4cCI6MjEwMjM4MzUwMX0.Z7Vaow9L_G8VFubWRSIhuI_dVq9RbQttJ1Tzye1ixeM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: 'mayfair'
  },
  auth: {
    persistSession: false
  }
});

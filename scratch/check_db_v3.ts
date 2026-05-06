import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vxdnudkaelhqntrrwdwa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4ZG51ZGthZWxocW50cnJ3ZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODUxNDcsImV4cCI6MjA5MDU2MTE0N30.F60JFpCwHAuKqL2IsurUpr-KY4UzEJMfVBJ1P4iBGyE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkTables() {
  console.log('Checking profiles...');
  const { data: profiles, error: pError } = await supabase.from('profiles').select('*').limit(1);
  if (pError) console.log('Profiles error:', pError);
  else console.log('Profiles table exists.');

  console.log('Checking users...');
  const { data: users, error: uError } = await supabase.from('users').select('*').limit(1);
  if (uError) console.log('Users error:', uError);
  else console.log('Users table exists.');
}

checkTables();

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './src/constants';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkTables() {
  const { data: profiles, error: pError } = await supabase.from('profiles').select('*').limit(1);
  console.log('Profiles:', { profiles, pError });
  
  const { data: users, error: uError } = await supabase.from('users').select('*').limit(1);
  console.log('Users:', { users, uError });
}

checkTables();

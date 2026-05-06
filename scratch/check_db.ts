import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './src/constants';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkUsersTable() {
  const { data, error } = await supabase.from('users').select('*').limit(1);
  console.log('Users table check:', { data, error });
  
  const { data: pData, error: pError } = await supabase.from('profiles').select('*').limit(1);
  console.log('Profiles table check:', { pData, pError });
}

checkUsersTable();

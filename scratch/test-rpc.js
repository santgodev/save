const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function testRPC() {
  console.log('Testing RPC signature...');
  const { error } = await supabase.rpc('transfer_between_pockets', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_from_id: '00000000-0000-0000-0000-000000000000',
    p_to_id: '00000000-0000-0000-0000-000000000001',
    p_amount: 100,
    p_date_string: '2026-07-22'
  });
  console.log('Error:', error?.message || 'Success (no error, meaning signature matches)');
}

testRPC();

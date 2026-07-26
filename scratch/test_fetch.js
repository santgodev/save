const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://vxdnudkaelhqntrrwdwa.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4ZG51ZGthZWxocW50cnJ3ZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODUxNDcsImV4cCI6MjA5MDU2MTE0N30.F60JFpCwHAuKqL2IsurUpr-KY4UzEJMfVBJ1P4iBGyE');

async function test() {
  const { data, error } = await supabase.from('transactions').select('id, amount, merchant, category, cycle_id, date_string, created_at').order('created_at', { ascending: false }).limit(5);
  console.log(JSON.stringify(data, null, 2));
}

test();

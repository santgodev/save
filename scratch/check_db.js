const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://vxdnudkaelhqntrrwdwa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4ZG51ZGthZWxocW50cnJ3ZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODUxNDcsImV4cCI6MjA5MDU2MTE0N30.F60JFpCwHAuKqL2IsurUpr-KY4UzEJMfVBJ1P4iBGyE'
);

async function main() {
  console.log('Fetching pockets...');
  const { data: pockets, error: pErr } = await supabase
    .from('pockets')
    .select('*');
  
  if (pErr) console.error(pErr);
  
  console.log('--- POCKETS ---');
  pockets.forEach(p => {
    console.log(`${p.name.padEnd(15)} | budget: ${p.budget} | allocated_budget: ${p.allocated_budget} | is_free: ${p.is_default_free}`);
  });
  
  console.log('\n--- RECENT TXS ---');
  const { data: allTxs } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(10);
  allTxs.forEach(t => {
    console.log(`${t.date_string} | ${t.category.padEnd(12)} | ${t.merchant.padEnd(20)} | ${t.amount}`);
  });
}

main();

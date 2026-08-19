const fs = require('fs');
const path = require('path');
const readline = require('readline');

const brainDir = 'C:\\Users\\santgodev\\.gemini\\antigravity-ide\\brain';
const outputDir = path.join(__dirname, 'recovered_files');

const dirs = fs.readdirSync(brainDir).filter(f => fs.statSync(path.join(brainDir, f)).isDirectory());

async function search() {
    let latestPockets = null;
    let latestTimestamp = 0;

    for (const d of dirs) {
        const tf = path.join(brainDir, d, '.system_generated', 'logs', 'transcript_full.jsonl');
        if (!fs.existsSync(tf)) continue;
        
        const fileStream = fs.createReadStream(tf);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        
        for await (const line of rl) {
            try {
                const j = JSON.parse(line);
                if (j.type === 'PLANNER_RESPONSE' && j.tool_calls) {
                    for (const tc of j.tool_calls) {
                        if (tc.name === 'write_to_file') {
                            const target = tc.args.TargetFile;
                            if (target && target.includes('Pockets.tsx')) {
                                const ts = new Date(j.created_at).getTime();
                                if (ts > latestTimestamp) {
                                    latestTimestamp = ts;
                                    latestPockets = { file: tf, call: tc, date: j.created_at };
                                }
                            }
                        }
                    }
                }
            } catch(e) {}
        }
    }

    if (latestPockets) {
        fs.writeFileSync(path.join(outputDir, 'latest_pockets_full.json'), JSON.stringify(latestPockets, null, 2));
        console.log('Found latest Pockets.tsx full write at ' + latestPockets.date);
    } else {
        console.log('No full writes found.');
    }
}

search();

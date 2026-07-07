const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      replaceInDir(p);
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      let c = fs.readFileSync(p, 'utf8');
      let nc = c.replace(/borderColor:\s*['"]rgba\(255,\s*255,\s*255,\s*0\.\d+\)['"]/g, 'borderColor: theme.colors.divider');
      if (c !== nc) {
        fs.writeFileSync(p, nc, 'utf8');
        console.log('Updated ' + p);
      }
    }
  }
}

replaceInDir('c:\\Desarrollo\\Save\\src');

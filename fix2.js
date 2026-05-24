const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(/null\}`\) \|\|[\s\n]*null\}`,\s*\{[\s\n]*allowExpired:\s*true,[\s\n]*\}\)/g, 'null');
code = code.replace(/null\}`\)/g, 'null');
fs.writeFileSync('server.js', code);

const fs = require('fs');
const text = fs.readFileSync('gsestockfeed.html', 'utf8');

const regex = /<li id="([^"]+)"><p class='top'><b>[^<]+<\/b>\&nbsp;([-+]?[0-9]*\.?[0-9]+),\&nbsp;([-+]?[0-9]*\.?[0-9]+)<\/p><p class='bottom'>([0-9]+)<\/p><\/li>/g;
let match;
const results = [];
while ((match = regex.exec(text)) !== null) {
  results.push({
    symbol: match[1],
    price: Number(match[2]),
    change: Number(match[3]),
    volume: Number(match[4])
  });
}
console.log(results.slice(0, 5));

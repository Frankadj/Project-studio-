const https = require('https');
const fs = require('fs');

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

async function run() {
  await download('https://raw.githubusercontent.com/Frankadj/Plutus/main/client/src/App.tsx', 'downloaded_App.tsx');
  await download('https://raw.githubusercontent.com/Frankadj/Plutus/main/client/package.json', 'downloaded_package.json');
  console.log('Downloaded files');
}

run();

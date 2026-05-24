import fetch from 'node-fetch';

fetch('http://localhost:3000/api/v1/market/quotes')
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data.data[0], null, 2)));

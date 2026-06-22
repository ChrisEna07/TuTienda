const http = require('http');

http.get('http://localhost:3000/manifest.json', (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('First 200 chars of body:');
    console.log(data.substring(0, 200));
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});

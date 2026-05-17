const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 5050,
  path: '/db/hands',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (e) => {
  console.error(`ERROR: ${e.message}`);
});

req.write(JSON.stringify({ heroName: 'jmenfouu', limit: 50, page: 1 }));
req.end();

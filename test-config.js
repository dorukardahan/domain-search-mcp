const config = require('./dist/config.js').config;

console.log('Config qwenInference:', JSON.stringify(config.qwenInference, null, 2));
console.log('Enabled:', config.qwenInference?.enabled);
console.log('Endpoint:', config.qwenInference?.endpoint);

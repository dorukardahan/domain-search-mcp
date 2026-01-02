const { getQwenClient } = require('./dist/services/qwen-inference.js');

console.log('Testing getQwenClient()...');
const client = getQwenClient();
console.log('Client:', client);
console.log('Is null?', client === null);
console.log('Is undefined?', client === undefined);

if (client) {
  console.log('\nTesting suggest()...');
  client.suggest({
    query: 'AI startup',
    style: 'brandable',
    tld: 'com',
    max_suggestions: 3
  }).then(results => {
    console.log('\n✅ Qwen results:', results);
  }).catch(error => {
    console.error('\n❌ Qwen error:', error.message);
  });
}

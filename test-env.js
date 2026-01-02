require('dotenv').config();
console.log('QWEN_INFERENCE_ENDPOINT:', process.env.QWEN_INFERENCE_ENDPOINT);
console.log('All QWEN vars:', Object.keys(process.env).filter(k => k.startsWith('QWEN')));

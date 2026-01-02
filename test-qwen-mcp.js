#!/usr/bin/env node
const { spawn } = require('child_process');

async function testMCP() {
  console.log('🧪 Testing MCP server with Qwen integration...\n');

  const mcp = spawn('node', ['dist/server.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  let output = '';
  
  mcp.stdout.on('data', (data) => {
    output += data.toString();
    const lines = output.split('\n');
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const msg = JSON.parse(line);
        if (msg.result && msg.id === 2) {
          console.log('✅ MCP Response received!');
          console.log('Response:', JSON.stringify(msg.result, null, 2));
          mcp.kill();
          process.exit(0);
        }
      } catch (e) {
        // Not JSON, skip
      }
    }
    
    output = lines[lines.length - 1];
  });

  mcp.stderr.on('data', (data) => {
    console.error('MCP stderr:', data.toString());
  });

  // Send initialization
  const initMsg = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  };
  
  mcp.stdin.write(JSON.stringify(initMsg) + '\n');

  // Wait for init, then send tool call
  setTimeout(() => {
    const toolCall = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'suggest_domains_smart',
        arguments: {
          query: 'AI customer service',
          style: 'brandable',
          max_suggestions: 5
        }
      }
    };
    
    console.log('📤 Sending tool call: suggest_domains_smart');
    console.log('   Query: "AI customer service"');
    console.log('   Style: brandable');
    console.log('   Max: 5 suggestions\n');
    
    mcp.stdin.write(JSON.stringify(toolCall) + '\n');
  }, 1000);

  setTimeout(() => {
    console.log('❌ Timeout - no response after 75s');
    mcp.kill();
    process.exit(1);
  }, 75000);
}

testMCP().catch(console.error);

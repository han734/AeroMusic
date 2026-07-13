const http = require('http');
const { spawn } = require('child_process');

console.log("Starting backend server in production mode...");
process.env.PORT = "3999";
process.env.NODE_ENV = "production";

// Start server.ts via tsx
const serverProcess = spawn('npx', ['tsx', 'server.ts'], {
  env: process.env,
  shell: true
});

serverProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(`[Server]: ${output.trim()}`);
  
  if (output.includes("running at") || output.includes("running")) {
    console.log("\nServer is running! Querying /admin.html...");
    setTimeout(queryAdminRoute, 1500);
  }
});

serverProcess.stderr.on('data', (data) => {
  console.error(`[Server Error]: ${data}`);
});

function queryAdminRoute() {
  http.get('http://localhost:3999/admin.html', (res) => {
    console.log(`Response Status: ${res.statusCode}`);
    console.log(`Response Headers:`, res.headers);
    
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      console.log(`\nResponse Body Snippet (first 400 chars):`);
      console.log(body.substring(0, 400));
      
      console.log("\nCleaning up server process...");
      serverProcess.kill('SIGINT');
      process.exit(0);
    });
  }).on('error', (err) => {
    console.error("HTTP request failed:", err);
    serverProcess.kill('SIGINT');
    process.exit(1);
  });
}

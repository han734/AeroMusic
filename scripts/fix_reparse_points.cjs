const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public');

console.log("Target Directory for Reparse Point Cleanup:", targetDir);

try {
  if (fs.existsSync(targetDir)) {
    // Run attrib +p to pin everything locally
    console.log("Pinning files locally via attrib...");
    execSync(`attrib +p "${targetDir}\\*" /s`, { stdio: 'inherit' });
  }
} catch (err) {
  console.warn("Warning running attrib:", err.message);
}

function fixFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.log("Directory does not exist:", dir);
    return;
  }
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.lstatSync(fullPath);
    if (stat.isDirectory()) {
      fixFiles(fullPath);
    } else if (stat.isFile()) {
      // Read content
      const content = fs.readFileSync(fullPath);
      // Delete file
      fs.unlinkSync(fullPath);
      // Write content back (creates a clean, regular local file)
      fs.writeFileSync(fullPath, content);
      console.log(`Recreated file to strip reparse point: ${item}`);
    }
  }
}

try {
  fixFiles(targetDir);
  console.log("Successfully fixed all synced assets!");
} catch (err) {
  console.error("Error fixing files:", err);
}

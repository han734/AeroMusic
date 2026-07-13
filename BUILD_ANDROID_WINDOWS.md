# AeroMusic Standalone App Packaging Guide

AeroMusic has been engineered with dual-mode architecture. You can compile this React & Vite web application into a fully responsive standalone Android **APK** or Windows **EXE**!

---

## 📱 Build for Android (.apk)

We recommend using **Capacitor** by Ionic. It takes the compiled static web build (`dist/`) and packages it inside a highly optimized native Android webview.

### Step 1: Install Capacitor Core & CLI
Open your terminal in the root folder of this project (when cloned locally) and run:
```bash
npm install @capacitor/core @capacitor/cli
```

### Step 2: Initialize Capacitor Config
Run the initialization command:
```bash
npx cap init
```
*Provide the following details when prompted:*
- **App name:** `AeroMusic`
- **App Package ID:** `com.aeromusic.premium`
- **Web asset directory:** `dist`

### Step 3: Install Android Support
Add the Android specific package:
```bash
npm install @capacitor/android
```

### Step 4: Configure `capacitor.config.json`
Create or modify `capacitor.config.json` in the project root with the following settings:
```json
{
  "appId": "com.aeromusic.premium",
  "appName": "AeroMusic",
  "webDir": "dist",
  "server": {
    "androidScheme": "https",
    "allowNavigation": ["*"]
  }
}
```

### Step 5: Build and Sync
Compile your React application and synchronize the assets into the native Android folder:
```bash
# 1. Compile the web code
npm run build

# 2. Add Android platform folders
npx cap add android

# 3. Copy web assets to the Android environment
npx cap sync
```

### Step 6: Generate the APK in Android Studio
Open the native project inside Android Studio:
```bash
npx cap open android
```
Once Android Studio boots up:
1. Wait for Gradle to finish sync.
2. Select **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
3. The APK will be ready inside `android/app/build/outputs/apk/debug/app-debug.apk`! You can install this directly on any Android device.

---

## 💻 Build for Windows (.exe)

We recommend using **Electron** and `electron-builder` to package the static folder into a portable desktop container.

### Step 1: Install Developer Dependencies
```bash
npm install --save-dev electron electron-builder
```

### Step 2: Add `main.js` inside Project Root
Create a file named `main.js` in the project's root folder with this optimized script:
```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "AeroMusic Premium Streamer",
    icon: path.join(__dirname, 'dist/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the compiled Vite SPA
  win.loadFile(path.join(__dirname, 'dist/index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

### Step 3: Configure `package.json` for Electron
Add an entry point and build script inside your `package.json`:
```json
{
  "main": "main.js",
  "scripts": {
    "electron:build": "npm run build && npx electron-builder build --win --portable"
  },
  "build": {
    "appId": "com.aeromusic.premium",
    "productName": "AeroMusic",
    "directories": {
      "output": "dist-desktop"
    },
    "files": [
      "dist/**/*",
      "main.js"
    ],
    "win": {
      "target": "portable"
    }
  }
}
```

### Step 4: Compile and Build Windows `.exe`
Run the compilation script in your terminal:
```bash
npm run electron:build
```
Your standalone `.exe` executable will be generated inside the `dist-desktop/` folder! You can run this single-file app on any Windows computer.

---

## 🌐 Dynamic Cloud Sync Config
To connect standalone APKs or Windows EXEs with your live streaming backend, navigate to the **APK / EXE Device Settings** tab in the sidebar of the AeroMusic interface, paste your deployed server URL, and click **Save Endpoint**. Standalone builds will instantly sync and route all streaming API traffic perfectly!

$ErrorActionPreference = "Stop"

# 1. Clean previous build folders
Write-Host "Cleaning previous build folders..."
$foldersToClean = @("dist", "dist-server", "dist-desktop", "dist-desktop-admin", "release")
foreach ($folder in $foldersToClean) {
    if (Test-Path $folder) {
        Write-Host "Removing $folder..."
        Remove-Item $folder -Recurse -Force
    }
}

# 1.5 Auto-detect LAN IP and save it for mobile builds
Write-Host "Auto-detecting local LAN IP address..."
# 1. Generate default_endpoint.ts (Check for cloud URL in .env, otherwise fallback to LAN IP)
try {
    $cloudUrl = $null
    if (Test-Path ".env") {
        $envContent = Get-Content -Path ".env"
        foreach ($line in $envContent) {
            if ($line -match "^AERO_CLOUD_URL=`"?(http[^`"\s]+)`"?") {
                $cloudUrl = $Matches[1]
                break
            }
        }
    }

    if ($cloudUrl) {
        Write-Host "Detected cloud URL configuration: $cloudUrl"
        $endpointContent = "export const DEFAULT_API_ENDPOINT = '$cloudUrl';"
    } else {
        $lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
            $_.IPAddress -notlike "127.*" -and 
            $_.InterfaceAlias -notlike "*Loopback*" -and 
            $_.IPAddress -notlike "169.254.*" -and 
            $_.InterfaceAlias -notlike "*Virtual*" -and 
            $_.InterfaceAlias -notlike "*vEthernet*" 
        } | Select-Object -First 1).IPAddress
        
        if (-not $lanIp) {
            $lanIp = "localhost"
        }
        Write-Host "Detected LAN IP: $lanIp"
        $endpointContent = "export const DEFAULT_API_ENDPOINT = 'http://$($lanIp):3000';"
    }
    
    Set-Content -Path "src/lib/default_endpoint.ts" -Value $endpointContent -Force
} catch {
    Write-Warning "Failed to set default endpoint. Falling back to empty endpoint."
    Set-Content -Path "src/lib/default_endpoint.ts" -Value "export const DEFAULT_API_ENDPOINT = '';" -Force
}

# 2. Build Vite Frontend and Server
Write-Host "Building web application and backend server..."
cmd.exe /c "npm run build"

# Pre-bake env credentials into server.cjs for packaged desktop standalone builds
try {
    if (Test-Path ".env") {
        Write-Host "Baking environment variables into dist-server/server.cjs..."
        $envLines = Get-Content -Path ".env"
        $varsToBake = @("SUPABASE_URL", "SUPABASE_KEY", "GITHUB_TOKEN", "GIST_ID")
        $bakeCode = ""
        
        foreach ($line in $envLines) {
            foreach ($var in $varsToBake) {
                if ($line -match "^$($var)=`"?(.*?)`"?$") {
                    $val = $Matches[1].Replace('"', '\"')
                    $bakeCode += "if (!process.env.$var) process.env.$var = `"$val`";`r`n"
                }
            }
        }
        
        if ($bakeCode) {
            $serverCjsPath = "dist-server/server.cjs"
            if (Test-Path $serverCjsPath) {
                $serverContent = Get-Content -Path $serverCjsPath -Raw
                $serverContent = $bakeCode + $serverContent
                Set-Content -Path $serverCjsPath -Value $serverContent -Force
                Write-Host "Successfully baked credentials into server.cjs!"
            }
        }
    }
} catch {
    Write-Warning "Failed to bake credentials into server.cjs: $_"
}


# 3. Build Portable Windows EXE
Write-Host "Building portable Windows EXE..."
cmd.exe /c "npm run electron:build"

Write-Host "Temporarily patching package.json main entry point for Admin Console build..."
$packageJsonPath = "package.json"
$packageContent = Get-Content -Path $packageJsonPath -Raw
$patchedContent = $packageContent -replace '"main": "electron-main.cjs"', '"main": "electron-admin-main.cjs"'
Set-Content -Path $packageJsonPath -Value $patchedContent -Force

Write-Host "Building standalone Admin Console EXE..."
cmd.exe /c "npm run electron:admin"

Write-Host "Restoring original package.json main entry point..."
Set-Content -Path $packageJsonPath -Value $packageContent -Force

# 4. Set Java Environment and Build Android APK
Write-Host "Checking Java environment for Android build..."
if (-not $env:JAVA_HOME) {
    $jbrPath = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $jbrPath) {
        $env:JAVA_HOME = $jbrPath
        Write-Host "Automatically setting JAVA_HOME to Android Studio JBR: $jbrPath"
    } else {
        if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
            Write-Warning "JAVA_HOME is not set and Java was not found in PATH. Android APK build might fail."
        }
    }
}

Write-Host "Syncing Capacitor web assets..."
cmd.exe /c "npx cap sync android"

Write-Host "Stripping OneDrive reparse points from synced assets..."
node scripts/fix_reparse_points.cjs

Write-Host "Preparing temporary build directory outside of OneDrive..."
$tempBuildDir = Join-Path $env:TEMP "AeroMusicBuildTemp"
if (Test-Path $tempBuildDir) {
    Write-Host "Cleaning up existing temp directory..."
    Remove-Item $tempBuildDir -Recurse -Force
}

# Create temp structure
New-Item -ItemType Directory -Path (Join-Path $tempBuildDir "node_modules\@capacitor") | Out-Null

# Copy android project
Write-Host "Copying Android project folder to temp directory..."
Copy-Item -Path "android" -Destination (Join-Path $tempBuildDir "android") -Recurse -Force

# Copy capacitor core dependency
Write-Host "Copying Capacitor android dependency..."
Copy-Item -Path "node_modules\@capacitor\android" -Destination (Join-Path $tempBuildDir "node_modules\@capacitor\android") -Recurse -Force

Write-Host "Building Android debug APK in temp folder..."
Push-Location (Join-Path $tempBuildDir "android")
cmd.exe /c "set JAVA_HOME=$env:JAVA_HOME&& .\gradlew.bat assembleDebug"
Pop-Location

# Copy built APK back to the workspace
$tempApk = Join-Path $tempBuildDir "android\app\build\outputs\apk\debug\app-debug.apk"
$destApkDir = "android\app\build\outputs\apk\debug"
if (Test-Path $tempApk) {
    Write-Host "Successfully compiled APK! Copying back to workspace..."
    if (-not (Test-Path $destApkDir)) { New-Item -ItemType Directory -Path $destApkDir | Out-Null }
    Copy-Item -Path $tempApk -Destination (Join-Path $destApkDir "app-debug.apk") -Force
} else {
    Write-Error "Android build failed: APK not found at $tempApk"
}

# Cleanup
Write-Host "Cleaning up temp build directory..."
Remove-Item $tempBuildDir -Recurse -Force


# 5. Prepare Release Folder
$releaseDir = Join-Path (Get-Location) "release"
Write-Host "Creating release folder at $releaseDir..."
if (-not (Test-Path $releaseDir)) { New-Item -ItemType Directory -Path $releaseDir | Out-Null }

# 6. Copy Target Binaries to Release Folder
$portableExe = "dist-desktop\AeroMusicInstaller.exe"
$targetExe = Join-Path $releaseDir "AeroMusicInstaller.exe"
if (Test-Path $portableExe) {
    Write-Host "Copying installer EXE to release folder..."
    Copy-Item $portableExe $targetExe -Force
} elseif (Test-Path $targetExe) {
    Write-Host "Installer EXE is already synced to the release folder."
} else {
    Write-Error "Installer EXE was not found at $portableExe or $targetExe"
}

$debugApk = "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $debugApk) {
    Write-Host "Copying Android APK to release folder..."
    Copy-Item $debugApk (Join-Path $releaseDir "AeroMusic.apk") -Force
} else {
    Write-Error "Android APK was not found at $debugApk"
}

# 6.5 Copy Admin Console Binary
$adminSource = Get-ChildItem "dist-desktop-admin\AeroMusicAdmin*.exe" | Select-Object -First 1
$adminTarget = Join-Path $releaseDir "AeroMusicAdmin.exe"
if ($adminSource) {
    Write-Host "Copying Admin Console EXE to release folder..."
    Copy-Item $adminSource.FullName $adminTarget -Force
    # Clean up admin temp folder
    Remove-Item "dist-desktop-admin" -Recurse -Force
} else {
    Write-Error "Admin Console EXE was not found in dist-desktop-admin"
}

# 7. Clean up all other .exe and .apk files in the workspace (excluding the release folder)
Write-Host "Cleaning up duplicate .exe and .apk files in working directories..."
Get-ChildItem -Path . -Recurse -File | Where-Object {
    ($_.Extension -eq ".exe" -or $_.Extension -eq ".apk") -and
    $_.FullName -notlike "$releaseDir*" -and
    $_.FullName -notmatch "node_modules"
} | ForEach-Object {
    Write-Host "Removing extra binary: $($_.FullName)"
    Remove-Item $_.FullName -Force
}

Write-Host "--------------------------------------------------------"
Write-Host "SUCCESS! Release package created at: $releaseDir"
Write-Host "Files in release folder:"
Get-ChildItem -Path $releaseDir | Format-Table Name, Length
Write-Host "--------------------------------------------------------"

# GitHub Actions Secrets Setup

This document describes all secrets required for automated desktop and mobile app builds for Max Booster.

## Quick Reference

| Category | Secret Name | Required For |
|----------|-------------|--------------|
| **Core** | `GITHUB_TOKEN` | All builds (auto-provided) |
| **Android** | `ANDROID_KEYSTORE_BASE64` | Signed APK/AAB |
| **Android** | `ANDROID_KEYSTORE_PASSWORD` | Signed APK/AAB |
| **Android** | `ANDROID_KEY_ALIAS` | Signed APK/AAB |
| **Android** | `ANDROID_KEY_PASSWORD` | Signed APK/AAB |
| **Android** | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Play Store upload |
| **iOS** | `APPLE_CERTIFICATE_BASE64` | Signed IPA |
| **iOS** | `APPLE_CERTIFICATE_PASSWORD` | Signed IPA |
| **iOS** | `APPLE_PROVISIONING_PROFILE_BASE64` | Signed IPA |
| **iOS** | `APPLE_TEAM_ID` | Signing & Notarization |
| **macOS** | `MAC_CERTIFICATE_BASE64` | Signed DMG |
| **macOS** | `MAC_CERTIFICATE_PASSWORD` | Signed DMG |
| **macOS** | `APPLE_ID` | Notarization |
| **macOS** | `APPLE_APP_SPECIFIC_PASSWORD` | Notarization |

---

## Detailed Setup Guide

### Desktop Builds (Electron)

Desktop builds use Electron Builder to create installers for Windows, macOS, and Linux.

#### Automatic Secrets

| Secret | Description |
|--------|-------------|
| `GITHUB_TOKEN` | Automatically provided by GitHub Actions. No setup needed. |

#### macOS Code Signing & Notarization

For distributing macOS apps, you need:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `MAC_CERTIFICATE_BASE64` | Base64-encoded Developer ID Application certificate (.p12) | Export from Keychain Access |
| `MAC_CERTIFICATE_PASSWORD` | Password used when exporting the .p12 file | Set during export |
| `APPLE_ID` | Your Apple Developer account email | developer.apple.com |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization | [appleid.apple.com](https://appleid.apple.com/account/manage) |
| `APPLE_TEAM_ID` | 10-character Team ID | developer.apple.com > Membership |

**Getting a Developer ID Certificate:**
1. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
2. Create a "Developer ID Application" certificate
3. Download and install in Keychain Access
4. Right-click > Export as .p12

---

### Mobile Builds (Capacitor)

Mobile builds use Capacitor to create Android APK/AAB and iOS IPA files.

#### Android Signing

| Secret | Description | How to Get |
|--------|-------------|------------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore file | Generate with `keytool` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password | Set during keystore creation |
| `ANDROID_KEY_ALIAS` | Key alias name in keystore | Set during keystore creation |
| `ANDROID_KEY_PASSWORD` | Key password | Set during keystore creation |

**Creating an Android Keystore:**

```bash
# Generate a new keystore
keytool -genkey -v -keystore release.keystore -alias maxbooster -keyalg RSA -keysize 2048 -validity 10000

# Convert to base64 for GitHub secret
base64 -i release.keystore > keystore-base64.txt
```

**Important:** Keep your keystore file safe! If you lose it, you cannot update your app on Google Play.

#### Google Play Store Upload

| Secret | Description | How to Get |
|--------|-------------|------------|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Service account JSON for API access | Google Play Console |

**Setting up Google Play Service Account:**
1. Go to [Google Play Console](https://play.google.com/console) > Setup > API access
2. Create a new service account or link existing
3. Grant "Release Manager" permission
4. Download the JSON key file
5. Copy the entire JSON content as the secret value

#### iOS Signing

| Secret | Description | How to Get |
|--------|-------------|------------|
| `APPLE_CERTIFICATE_BASE64` | Base64-encoded iOS Distribution certificate (.p12) | Apple Developer Portal |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 file | Set during export |
| `APPLE_PROVISIONING_PROFILE_BASE64` | Base64-encoded App Store provisioning profile | Apple Developer Portal |
| `APPLE_TEAM_ID` | Your 10-character Team ID | developer.apple.com > Membership |

**Getting iOS Distribution Certificate:**
1. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
2. Create an "Apple Distribution" certificate
3. Download and install in Keychain Access
4. Export as .p12 from Keychain Access

**Getting Provisioning Profile:**
1. Go to [developer.apple.com/account/resources/profiles](https://developer.apple.com/account/resources/profiles)
2. Create an "App Store" provisioning profile
3. Select the Max Booster App ID (`com.blawzmusic.maxbooster`)
4. Download the .mobileprovision file

---

## Encoding Files as Base64

All certificate and keystore files must be base64-encoded before adding as secrets.

### macOS/Linux

```bash
# Encode a file and copy to clipboard
base64 -i your-file.p12 | pbcopy

# Or save to a file
base64 -i your-file.p12 > encoded.txt

# View the encoded content
cat encoded.txt
```

### Windows (PowerShell)

```powershell
# Encode a file
[Convert]::ToBase64String([IO.File]::ReadAllBytes("your-file.p12")) | Set-Clipboard

# Or save to file
[Convert]::ToBase64String([IO.File]::ReadAllBytes("your-file.p12")) | Out-File encoded.txt
```

---

## Adding Secrets to GitHub

1. Go to your GitHub repository
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Enter the secret name exactly as shown in this document
5. Paste the secret value
6. Click **Add secret**

---

## Triggering Builds

### Automatic Builds (on Git Tag)

Create and push a version tag to trigger builds:

```bash
# Create a version tag
git tag v2.1.0

# Push the tag
git push origin v2.1.0
```

Tag naming conventions:
- `v2.1.0` - Stable release
- `v2.1.0-beta.1` - Beta release
- `v2.1.0-alpha.1` - Alpha release
- `v2.1.0-rc.1` - Release candidate

### Manual Builds

1. Go to your repository's **Actions** tab
2. Select **Build Desktop Apps** or **Build Mobile Apps**
3. Click **Run workflow**
4. Select options:
   - **Desktop**: Choose version and platforms (all, linux, windows, macos)
   - **Mobile**: Choose platform (ios, android, both) and build type (debug, release)
5. Click **Run workflow**

---

## Build Outputs

### Desktop Artifacts

| Platform | Files | Description |
|----------|-------|-------------|
| Windows | `.exe` (NSIS), `.exe` (Portable) | Installer and standalone |
| macOS | `.dmg`, `.zip` | Disk image and archive |
| Linux | `.AppImage`, `.deb`, `.tar.gz` | Universal, Debian, Archive |

### Mobile Artifacts

| Platform | Files | Description |
|----------|-------|-------------|
| Android | `.apk` (Debug), `.apk` (Release), `.aab` | Debug, Signed, Play Store |
| iOS | `.app` (Simulator), `.ipa` | Simulator, App Store |

### Artifact Retention

- Debug builds: 14 days
- Release builds: 30 days
- GitHub Releases: Permanent

---

## Security Best Practices

1. **Never commit secrets** - Use GitHub Secrets only, never put credentials in code
2. **Rotate secrets regularly** - Update certificates before expiration
3. **Use fine-grained permissions** - Grant minimum required access
4. **Audit access** - Review who has access to repository secrets
5. **Secure backup** - Keep encrypted backups of keystores and certificates
6. **Enable branch protection** - Require reviews before merging to main

---

## Troubleshooting

### Common Issues

**Build fails with "No keystore found"**
- Ensure `ANDROID_KEYSTORE_BASE64` is properly base64-encoded
- Verify the keystore password is correct

**macOS app shows "damaged" warning**
- App wasn't signed/notarized. Ensure all `APPLE_*` secrets are set
- Run `xattr -cr /Applications/Max\ Booster.app` to clear quarantine

**iOS build fails with "no valid signing identity"**
- Check certificate hasn't expired
- Ensure provisioning profile matches the App ID

**Google Play upload fails**
- Verify service account has "Release Manager" permission
- Check the app is set up in Play Console first

---

## What's New Directory

For Google Play upload, create release notes in `.github/whatsnew/`:

```
.github/
  whatsnew/
    whatsnew-en-US
    whatsnew-es-ES
    whatsnew-fr-FR
```

Example `whatsnew-en-US`:
```
- New mobile-optimized interface
- Improved performance
- Bug fixes and stability improvements
```

---

## Support

For issues with GitHub Actions workflows:
1. Check the Actions tab for detailed error logs
2. Verify all required secrets are set
3. Ensure certificates/profiles haven't expired
4. Review this documentation for correct setup

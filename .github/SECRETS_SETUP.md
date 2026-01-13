# GitHub Actions Secrets Setup

This document describes the secrets required for automated desktop and mobile builds.

## Required Secrets

### Desktop Builds (Electron)

| Secret | Description | Required |
|--------|-------------|----------|
| `GITHUB_TOKEN` | Auto-generated, no setup needed | Auto |

#### macOS Code Signing (Optional but Recommended)

| Secret | Description |
|--------|-------------|
| `MAC_CERTIFICATE` | Base64-encoded .p12 certificate file |
| `MAC_CERTIFICATE_PASSWORD` | Password for the .p12 certificate |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

### Mobile Builds (Capacitor)

#### Android

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_FILE` | Base64-encoded keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias in the keystore |
| `ANDROID_KEY_PASSWORD` | Key password |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Service account JSON for Play Store uploads |

#### iOS

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded signing certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Certificate password |
| `APPLE_PROVISIONING_PROFILE` | Base64-encoded provisioning profile |

## Security Best Practices

1. **Use fine-grained access tokens** when possible instead of broad permissions
2. **Rotate secrets regularly** - Update certificates and passwords periodically
3. **Limit secret access** - Only add secrets to repositories that need them
4. **Use environment protection rules** - Require approvals for production deployments
5. **Audit secret usage** - Review Actions logs to ensure secrets aren't exposed

## Setting Up Secrets

1. Go to your GitHub repository
2. Navigate to Settings > Secrets and variables > Actions
3. Click "New repository secret"
4. Add each secret with the appropriate name and value

## Encoding Files as Base64

For certificate and keystore files:

```bash
# macOS/Linux
base64 -i your-certificate.p12 | pbcopy

# Or save to file
base64 -i your-certificate.p12 > certificate-base64.txt
```

## Triggering Builds

### Automatic (on tag)
```bash
git tag v2.0.1
git push origin v2.0.1
```

### Manual
1. Go to Actions tab in GitHub
2. Select the workflow (Build Desktop Apps or Build Mobile Apps)
3. Click "Run workflow"
4. Select options and run

## Build Outputs

All build artifacts are available in the Actions tab:
- **Desktop**: Windows (.exe), macOS (.dmg, .zip), Linux (.AppImage, .deb)
- **Mobile**: Android (.apk, .aab), iOS (.ipa)

For tagged releases, artifacts are automatically attached to the GitHub Release.

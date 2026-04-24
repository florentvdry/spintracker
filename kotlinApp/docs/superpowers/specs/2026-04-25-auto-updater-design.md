# Auto-Updater Design Specification

## Overview

Implement an auto-update system for SpinTracker that checks for new versions on GitHub Releases at application startup and allows users to download and install updates with a single click.

## Architecture

### Components

1. **UpdateService** (`services/UpdateService.kt`)
   - GitHub Releases API client
   - Version comparison logic
   - Fetches latest release info (version, changelog, assets)

2. **UpdateChecker** (`services/UpdateChecker.kt`)
   - Determines if update is available
   - Runs during splash screen display
   - Caches result to avoid repeated checks

3. **UpdateDialog** (`ui/components/UpdateDialog.kt`)
   - Compose dialog showing:
     - New version number
     - Current version number
     - Release notes/changelog
     - "Download & Install" button
     - "Skip" button
   - Modal, blocks interaction until dismissed

4. **UpdateDownloader** (`services/UpdateDownloader.kt`)
   - Downloads release asset from GitHub
   - Shows progress indicator
   - Validates download (optional checksum)
   - Saves to temporary location

5. **UpdateInstaller** (`services/UpdateInstaller.kt`)
   - Platform-specific installation logic
   - Windows: Replaces exe files, handles file locks
   - Mac: Replaces app bundle
   - Linux: Replaces executable
   - Restarts application after installation

6. **UpdateSettings** (`models/Settings.kt` extension)
   - `autoUpdateEnabled: Boolean` (default: true)
   - Persisted to user preferences

### Data Flow

```
SplashScreen starts
        ↓
UpdateChecker checks GitHub API (if enabled)
        ↓
   New version?
     /       \
   No         Yes → Main UI loads → Show UpdateDialog
   ↓                    ↓
Main UI        User accepts? → UpdateDownloader
                              ↓
                        UpdateInstaller
                              ↓
                        App restarts
```

## GitHub Releases Structure

### Release Tag Format
`v1.2.3` (semantic versioning with 'v' prefix)

### Assets per Release
- `SpinTracker-win.zip` (Windows)
- `SpinTracker-mac.dmg` (macOS)
- `SpinTracker-linux.deb` (Linux)

### Release Notes
Standard GitHub release description (markdown)

## Version Management

Version is defined in `build.gradle.kts`:
```kotlin
version = "1.0.0"
```

Developer updates this manually before each release.

## API Integration

### GitHub Releases API
```
GET https://api.github.com/repos/{owner}/{repo}/releases/latest
```

Response fields used:
- `tag_name` → Extract version (strip 'v' prefix)
- `body` → Changelog/release notes
- `assets` → Download URLs (filter by platform)

### Rate Limiting
- GitHub allows 60 requests/hour unauthenticated
- Consider adding simple ETag caching if needed

## Error Handling

| Error | Behavior |
|-------|----------|
| Network failure | Silent fail, retry next launch |
| GitHub API error | Silent fail, log warning |
| Download failure | Show error dialog with retry option |
| Install failure | Show error, provide manual download link |
| Parse error (version) | Silent fail, log warning |

## User Settings

Add to Settings screen:
- Toggle: "Automatically check for updates"
- Default: Enabled
- When disabled: No update checks performed

## UI States

### UpdateDialog States
1. **Checking** - Loading spinner (brief)
2. **Available** - Show changelog, buttons
3. **Downloading** - Progress bar, cancel button
4. **Installing** - Progress indicator
5. **Error** - Error message, retry/close buttons

## Security Considerations

- Only download from official GitHub Releases
- Verify asset URL matches expected pattern
- Consider SHA256 checksum verification (future enhancement)

## Testing Strategy

1. Unit tests for version comparison logic
2. Mock GitHub API responses for dialog states
3. Manual testing of download/install flow
4. Test with no network connectivity

## Future Enhancements (Not In Scope)

- Automatic background updates (no prompt)
- Delta updates (download only changes)
- Beta/release channel selection
- Release date display
- Download size display

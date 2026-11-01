# Mobile playback / iOS system UI investigation (2026-11)

## Scope

User-reported mobile comparison view showed two 80px Spotify embeds nested under two large artwork cards. Changes here are limited to playback controls, mobile SDK feature detection, and an appropriate fallback. Ranking algorithms, A/B interaction, card dimensions, 5-choice scale and navigation remain unchanged.

## iOS status bar & Dynamic Island

- The time, cellular/battery icons and Dynamic Island in the user screenshot belong to **iOS**, not the React app. No website-specific code renders those.
- iOS standalone PWA can configure appearance using `apple-mobile-web-app-status-bar-style` (this app already uses `black-translucent`), but a web app cannot reliably remove the native status bar or Dynamic Island.
- Therefore no counterfeit "hide iOS" CSS, status bar overlays, negative safe-area offsets or native-only capabilities are introduced.
- `TopBar.tsx` already respects `env(safe-area-inset-top)`; `TabBar.tsx` respects the bottom safe area.

Sources:
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html

## Spotify full track playback on mobile

- Spotify's **Web Playback SDK officially supports Android and iOS mobile browsers**, although iOS requires explicit user interaction to begin audio and may pause during device transfer.
- Previously `useSpotifyPlayer` returned immediately on mobile and forcibly switched to an Embed without attempting a Premium SDK session.
- Now mobile attempts Web Playback SDK; automatic tier playback stays **disabled on mobile** until a user taps play; calls `activateElement()` on user play/toggle; and falls back if the SDK cannot connect/become ready.
- A full track depends on Premium, DRM/EME compatibility, browser and Spotify account conditions. It cannot be guaranteed by web code or verified without testing on the actual device.
- The fallback Spotify Embed might offer full audio or only a short preview. Accordingly, the UI does not claim that every embed is a 30-second preview or that full playback is guaranteed.

Sources:
- https://developer.spotify.com/documentation/web-playback-sdk
- https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started
- https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting
- https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback

## Compact Spotify fallback

- The Spotify **official iFrame API** supports `play`, `pause`, playback events and `destroy`.
- For comparison, replace each always-visible 80px album-art mini-player with a round play/pause button, small "Spotify 플레이어" disclosure and Spotify track link.
- Use the unmodified Spotify official iFrame API media player; it is mounted off-screen when collapsed and can be expanded as the native Spotify player if custom playback is restricted.
- If the iframe API script fails to load, the disclosure reveals the normal official iframe.
- On choice/skip/undo/phase exit, pause the active embed. If another song starts, pause the previous embed. Never claim playing before a Spotify playback event confirms it.
- Metadata, cover art, and Spotify attribution/link remain visible. Only the duplicate art within the embedded player is out of view until explicitly expanded.

Sources:
- https://developer.spotify.com/documentation/embeds/references/iframe-api
- https://developer.spotify.com/documentation/embeds/tutorials/using-the-iframe-api
- https://developer.spotify.com/documentation/design

## Manual mobile QA checklist

1. iPhone Safari (browser tab), iPhone Home Screen PWA, Android Chrome, desktop Firefox/Chrome/Edge.
2. Confirm iOS status bar & Dynamic Island remain system controlled and no app element intersects safe-area insets.
3. Spotify Premium + authenticated: tap A and B play independently, verify full song can play on supported devices, pause and switch.
4. Failures: no Premium, blocked DRM, no device, iframe-api blocked, SDK timeout, Spotify iframe autoplay restriction. Confirm explicit fallback and Spotify opening link rather than dead buttons.
5. Confirm comparison, skip, undo and tier screen exit stop audio; verify no simultaneous A/B playback.
6. Verify no automatic mobile audio when moving between tracks or changing comparison pair.
7. Check 320px–430px screen widths, large text, dark/light theme and landscape. Original artwork sizes, title sizes and 5-choice layout remain unchanged.

**Not yet independently tested on a real iOS device.** GitHub Actions can validate TypeScript, unit tests, and builds but not Safari DRM or system audio UI.

# WangDoKu for iPhone

This native SwiftUI shell ships the full WangDoKu web game inside the app bundle, so it works offline while retaining every game mode, puzzle generator, tutorial, language, share-link and 1 vs 1 feature.

It adds a native launch experience plus synthesized interaction sounds and iPhone haptic feedback. Before opening the project in Xcode, sync the bundled site:

```sh
zsh ios/WangDoKu/scripts/sync-web.sh
```

Then open `WangDoKu.xcodeproj`, choose an iPhone simulator or your signed device, and Run. The project targets iOS 16.0 and uses bundle id `com.chihuangchiu.WangDoKu`; change it in Xcode before App Store distribution if needed.

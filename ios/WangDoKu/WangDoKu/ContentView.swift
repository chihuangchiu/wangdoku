import SwiftUI

struct ContentView: View {
    @State private var isReady = false
    @State private var roomCode: String?

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.91, green: 0.96, blue: 1), Color.white, Color(red: 1, green: 0.96, blue: 0.90)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            WangDoKuWebView(roomCode: roomCode)
                .opacity(isReady ? 1 : 0)

            if !isReady {
                VStack(spacing: 14) {
                    Text("🐶")
                        .font(.system(size: 68))
                        .shadow(color: .black.opacity(0.08), radius: 8, y: 6)
                    Text("WangDoKu")
                        .font(.system(size: 34, weight: .black, design: .rounded))
                        .foregroundStyle(Color(red: 0.12, green: 0.25, blue: 0.38))
                    Text("One pup. Every row. Every color.")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                    ProgressView()
                        .tint(Color(red: 0.98, green: 0.40, blue: 0.40))
                        .padding(.top, 6)
                }
                .transition(.opacity)
            }
        }
        .task {
            try? await Task.sleep(for: .milliseconds(520))
            withAnimation(.easeOut(duration: 0.24)) { isReady = true }
        }
        .onOpenURL { url in
            guard url.scheme?.lowercased() == "wangdoku",
                  url.host?.lowercased() == "match",
                  let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  let room = components.queryItems?.first(where: { $0.name == "room" })?.value else { return }
            roomCode = room.uppercased()
        }
    }
}

import AVFoundation
import UIKit

/// Small synthesized sounds keep the app offline and avoid third-party audio licensing.
final class SoundHapticEngine {
    static let shared = SoundHapticEngine()

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    private var isRunning = false

    private init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    func play(_ event: String) {
        switch event {
        case "mark":
            impact(.light); tone([560], duration: 0.035)
        case "dog":
            impact(.medium); tone([520, 780], duration: 0.09)
        case "aiDog":
            impact(.rigid); tone([310, 390], duration: 0.08)
        case "hint":
            impact(.soft); tone([740, 990], duration: 0.12)
        case "error":
            UINotificationFeedbackGenerator().notificationOccurred(.error); tone([190, 145], duration: 0.16)
        case "win":
            UINotificationFeedbackGenerator().notificationOccurred(.success); tone([523, 659, 784, 1047], duration: 0.30)
        default:
            impact(.soft)
        }
    }

    private func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.prepare()
        generator.impactOccurred()
    }

    private func tone(_ frequencies: [Double], duration: Double) {
        guard !frequencies.isEmpty else { return }
        if !isRunning {
            do { try engine.start(); isRunning = true } catch { return }
        }
        let frames = AVAudioFrameCount(format.sampleRate * duration)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames),
              let channel = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = frames
        for frame in 0..<Int(frames) {
            let time = Double(frame) / format.sampleRate
            let fade = min(1, Double(frame) / 180) * min(1, Double(Int(frames) - frame) / 500)
            let sample = frequencies.reduce(0.0) { $0 + sin(2 * .pi * $1 * time) } / Double(frequencies.count)
            channel[frame] = Float(sample * fade * 0.18)
        }
        player.scheduleBuffer(buffer, at: nil, options: .interrupts)
        player.play()
    }
}

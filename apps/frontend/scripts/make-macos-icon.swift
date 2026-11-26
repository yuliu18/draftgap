// Builds the macOS app icon (icon.icns) in the macOS icon grid: a rounded
// square occupying 824x824 of a 1024x1024 canvas, with a soft shadow.
//
// Usage (from apps/frontend):
//   swift scripts/make-macos-icon.swift src-tauri/icons/icon-source-1024.png /tmp/DraftGap.iconset
//   iconutil -c icns /tmp/DraftGap.iconset -o src-tauri/icons/icon.icns
//
// The source is the original full-bleed DraftGap artwork. Its flat background
// colour is sampled and used for the rounded square, so the artwork can be
// drawn smaller inside it without a visible seam and without the lettering
// being clipped by the rounded corners.

import AppKit

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    FileHandle.standardError.write("usage: make-macos-icon.swift <source.png> <out.iconset>\n".data(using: .utf8)!)
    exit(2)
}
let sourceURL = URL(fileURLWithPath: arguments[1])
let outputURL = URL(fileURLWithPath: arguments[2])

guard let source = NSImage(contentsOf: sourceURL),
    let sourceCG = source.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
    FileHandle.standardError.write("could not read \(sourceURL.path)\n".data(using: .utf8)!)
    exit(1)
}

/// Samples the artwork's background colour from a point well inside its top-left area.
func backgroundColor(of image: CGImage) -> CGColor {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    var pixel = [UInt8](repeating: 0, count: 4)
    let context = CGContext(
        data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: space,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let x = image.width / 4
    let y = image.height / 4
    // Draw the image shifted so the sampled pixel lands on the 1x1 context.
    context.draw(
        image,
        in: CGRect(x: -x, y: -(image.height - 1 - y), width: image.width, height: image.height))
    return CGColor(
        colorSpace: space,
        components: [
            CGFloat(pixel[0]) / 255, CGFloat(pixel[1]) / 255, CGFloat(pixel[2]) / 255, 1,
        ])!
}

let background = backgroundColor(of: sourceCG)

/// Renders the icon at `size` pixels. All geometry is defined on a 1024 grid.
func render(size: Int) -> Data {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let context = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.interpolationQuality = .high
    let scale = CGFloat(size) / 1024
    context.scaleBy(x: scale, y: scale)

    let plate = CGRect(x: 100, y: 100, width: 824, height: 824)
    let shape = CGPath(
        roundedRect: plate, cornerWidth: 185.4, cornerHeight: 185.4, transform: nil)

    // Plate with the standard soft drop shadow.
    context.saveGState()
    context.setShadow(
        offset: CGSize(width: 0, height: -10 * scale), blur: 20 * scale,
        color: CGColor(gray: 0, alpha: 0.3))
    context.addPath(shape)
    context.setFillColor(background)
    context.fillPath()
    context.restoreGState()

    // Artwork, anchored bottom-right like the original, inside the safe area.
    context.saveGState()
    context.addPath(shape)
    context.clip()
    context.draw(sourceCG, in: CGRect(x: 128, y: 136, width: 760, height: 760))
    context.restoreGState()

    let image = context.makeImage()!
    let representation = NSBitmapImageRep(cgImage: image)
    return representation.representation(using: .png, properties: [:])!
}

try? FileManager.default.removeItem(at: outputURL)
try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)

let entries: [(name: String, size: Int)] = [
    ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
]
for entry in entries {
    try render(size: entry.size).write(to: outputURL.appendingPathComponent(entry.name))
}
print("wrote \(entries.count) images to \(outputURL.path)")

import AppKit
import Foundation

for path in CommandLine.arguments.dropFirst() {
    guard let image = NSImage(contentsOfFile: path),
          let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        FileHandle.standardError.write(Data("Could not render \(path)\n".utf8))
        exit(1)
    }
    let output = URL(fileURLWithPath: path).deletingPathExtension().appendingPathExtension("png")
    try png.write(to: output)
}

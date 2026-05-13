//
//  EncryptionUtil.swift
//
//  AES/CBC encryption + SHA-256 body hash, mirroring Android's `EncryptionUtil.kt`
//  byte-for-byte:
//    - AES algorithm:   AES/CBC/NoPadding (we pad manually with PKCS5)
//    - Key:             last 32 bytes of `Secrets.encryptionKey` (UTF-8)
//    - IV:              first 16 bytes of `Secrets.ivKey` (UTF-8)
//    - Output:          lowercase hex string
//    - Body hash:       SHA-256(body + moduleData + salt), lowercase hex
//

import Foundation
import CommonCrypto
import CryptoKit

enum EncryptionUtil {

    /// AES-CBC encrypt `plain` and return the lowercase hex of the ciphertext.
    /// Matches Android's `EncryptionUtil.encrypt()`.
    static func encrypt(_ plain: String) -> String {
        let keyBytes = Array(Secrets.encryptionKey.suffix(32).utf8)   // takeLast(32)
        let ivBytes  = Array(Secrets.ivKey.prefix(16).utf8)            // take(16)
        let blockSize = kCCBlockSizeAES128                             // 16
        guard keyBytes.count == 32, ivBytes.count == 16 else { return "" }

        // PKCS5 manual padding — Android adds (blockSize - len%blockSize) bytes
        // each set to the pad length value.
        var data = Array(plain.utf8)
        let padLen = blockSize - (data.count % blockSize)
        data.append(contentsOf: Array(repeating: UInt8(padLen), count: padLen))

        // CCCrypt with kCCOptionECBMode=off (CBC default) and ZERO options
        // (no built-in padding — we already padded).
        var out = [UInt8](repeating: 0, count: data.count + blockSize)
        var outLen: size_t = 0
        let status = data.withUnsafeBufferPointer { dataPtr in
            keyBytes.withUnsafeBufferPointer { keyPtr in
                ivBytes.withUnsafeBufferPointer { ivPtr in
                    out.withUnsafeMutableBufferPointer { outPtr in
                        CCCrypt(
                            CCOperation(kCCEncrypt),
                            CCAlgorithm(kCCAlgorithmAES),
                            0,                          // no built-in padding
                            keyPtr.baseAddress, keyBytes.count,
                            ivPtr.baseAddress,
                            dataPtr.baseAddress, data.count,
                            outPtr.baseAddress, out.count,
                            &outLen
                        )
                    }
                }
            }
        }
        guard status == kCCSuccess else { return "" }
        return out.prefix(outLen).map { String(format: "%02x", $0) }.joined()
    }

    /// SHA-256( body + moduleData + salt ) → lowercase hex.
    /// Matches Android's `EncryptionUtil.generateBodyHash()`.
    static func bodyHash(body: String?, moduleData: String) -> String {
        let combined = (body ?? "") + moduleData + Secrets.salt
        let digest = SHA256.hash(data: Data(combined.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

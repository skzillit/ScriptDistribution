package com.zillit.scriptdistribution.util

import com.zillit.scriptdistribution.BuildConfig
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

object EncryptionUtil {
    private const val ALGORITHM = "AES/CBC/NoPadding"

    private fun getKey(): SecretKeySpec {
        val keyStr = BuildConfig.ENCRYPTION_KEY
        val keyBytes = keyStr.takeLast(32).toByteArray(Charsets.UTF_8)
        return SecretKeySpec(keyBytes, "AES")
    }

    private fun getIv(): IvParameterSpec {
        val ivStr = BuildConfig.IV_KEY
        val ivBytes = ivStr.take(16).toByteArray(Charsets.UTF_8)
        return IvParameterSpec(ivBytes)
    }

    fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(ALGORITHM)
        cipher.init(Cipher.ENCRYPT_MODE, getKey(), getIv())
        // PKCS5 manual padding
        val blockSize = 16
        val bytes = plainText.toByteArray(Charsets.UTF_8)
        val padLen = blockSize - (bytes.size % blockSize)
        val padded = bytes + ByteArray(padLen) { padLen.toByte() }
        val encrypted = cipher.doFinal(padded)
        return encrypted.joinToString("") { "%02x".format(it) }
    }

    fun generateBodyHash(body: String?, moduleData: String): String {
        val salt = BuildConfig.IV_ENCRYPTION_SALT
        val combined = (body.orEmpty() + moduleData + salt).toByteArray(Charsets.UTF_8)
        val digest = MessageDigest.getInstance("SHA-256").digest(combined)
        return digest.joinToString("") { "%02x".format(it) }
    }
}

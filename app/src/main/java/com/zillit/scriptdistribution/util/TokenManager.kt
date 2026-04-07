package com.zillit.scriptdistribution.util

import android.content.Context
import android.content.SharedPreferences
import android.provider.Settings
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object TokenManager {
    private const val PREF_NAME = "script_dist_prefs"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_USER_NAME = "user_name"

    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        prefs = EncryptedSharedPreferences.create(
            context,
            PREF_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        // Generate device ID if not exists
        if (getDeviceId().isEmpty()) {
            val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            setDeviceId(androidId ?: "android-${System.currentTimeMillis()}")
        }
    }

    fun getUserId(): String = prefs.getString(KEY_USER_ID, "") ?: ""
    fun setUserId(id: String) = prefs.edit().putString(KEY_USER_ID, id).apply()

    fun getDeviceId(): String = prefs.getString(KEY_DEVICE_ID, "") ?: ""
    fun setDeviceId(id: String) = prefs.edit().putString(KEY_DEVICE_ID, id).apply()

    fun getUserName(): String = prefs.getString(KEY_USER_NAME, "") ?: ""
    fun setUserName(name: String) = prefs.edit().putString(KEY_USER_NAME, name).apply()

    fun isLoggedIn(): Boolean = getUserId().isNotEmpty()
}

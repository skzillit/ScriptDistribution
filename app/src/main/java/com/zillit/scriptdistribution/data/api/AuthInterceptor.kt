package com.zillit.scriptdistribution.data.api

import com.google.gson.Gson
import com.zillit.scriptdistribution.util.EncryptionUtil
import com.zillit.scriptdistribution.util.TokenManager
import okhttp3.Interceptor
import okhttp3.Response
import okio.Buffer
import java.util.Calendar
import java.util.TimeZone

class AuthInterceptor : Interceptor {
    private val gson = Gson()

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()

        val moduleDataJson = gson.toJson(mapOf(
            "device_id" to TokenManager.getDeviceId(),
            "user_id" to TokenManager.getUserId().ifEmpty { null },
            "time_stamp" to System.currentTimeMillis()
        ))

        val encryptedModuleData = EncryptionUtil.encrypt(moduleDataJson)

        // Get request body as string for hash
        val bodyString = original.body?.let {
            val buffer = Buffer()
            it.writeTo(buffer)
            buffer.readUtf8()
        }

        val bodyHash = EncryptionUtil.generateBodyHash(bodyString, encryptedModuleData)

        val request = original.newBuilder()
            .header("moduledata", encryptedModuleData)
            .header("bodyhash", bodyHash)
            .header("Timezone", TimeZone.getDefault().id)
            .header("deviceInfo", getDeviceInfo())
            .build()

        return chain.proceed(request)
    }

    private fun getDeviceInfo(): String {
        return "${android.os.Build.MODEL}|${android.os.Build.VERSION.SDK_INT}|Android"
    }
}

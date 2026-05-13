package com.zillit.scriptdistribution.data.api

import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.TimeUnit
import kotlin.math.min
import kotlin.math.pow

/**
 * Lightweight WebSocket client for backend real-time events.
 *
 * The backend exposes /ws and broadcasts JSON messages of shape
 *   { "event": "sides:updated", "data": { ... } }
 *
 * Callers register listeners via [addListener]. Reconnect is automatic with
 * exponential backoff. There is one shared connection for the whole process.
 */
object RealtimeManager {

    fun interface Listener {
        fun onEvent(event: String, data: JSONObject)
    }

    private val listeners = CopyOnWriteArraySet<Listener>()
    private val client by lazy {
        OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS) // keep socket open indefinitely
            .pingInterval(30, TimeUnit.SECONDS)
            .build()
    }
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile private var socket: WebSocket? = null
    @Volatile private var connecting = false
    @Volatile private var attempts = 0

    private fun wsUrl(): String {
        val base = ApiClient.BASE_URL
        val wsBase = base.replace(Regex("^http"), "ws")
        return "$wsBase/ws"
    }

    fun addListener(l: Listener) {
        listeners.add(l)
        connect()
    }

    fun removeListener(l: Listener) {
        listeners.remove(l)
    }

    @Synchronized
    private fun connect() {
        if (socket != null || connecting) return
        connecting = true
        val request = Request.Builder().url(wsUrl()).build()
        client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                socket = ws
                connecting = false
                attempts = 0
            }

            override fun onMessage(ws: WebSocket, text: String) {
                val obj = runCatching { JSONObject(text) }.getOrNull() ?: return
                val event = obj.optString("event", "")
                val data = obj.optJSONObject("data") ?: JSONObject()
                if (event.isEmpty()) return
                mainHandler.post {
                    listeners.forEach { runCatching { it.onEvent(event, data) } }
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                socket = null
                connecting = false
                scheduleReconnect()
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                socket = null
                connecting = false
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (listeners.isEmpty()) return
        val delayMs = min(30_000L, (1000.0 * 2.0.pow(attempts++.toDouble())).toLong())
        mainHandler.postDelayed({ connect() }, delayMs)
    }
}

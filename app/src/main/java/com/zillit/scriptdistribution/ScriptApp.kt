package com.zillit.scriptdistribution

import android.app.Application

class ScriptApp : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    companion object {
        lateinit var instance: ScriptApp
            private set
    }
}

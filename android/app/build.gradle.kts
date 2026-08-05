plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "uz.fikrlovchi.stocker"
    compileSdk = 35

    defaultConfig {
        applicationId = "uz.fikrlovchi.stocker"
        // minSdk 26: faqat adaptive ikonka ishlatiladi (PNG mipmap'lar yo'q).
        // Android 8.0+ — barcha zamonaviy telefonlar.
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.4.0"
    }

    buildTypes {
        release {
            // Kod qisqartirish o'chirilgan: ML Kit va serialization uchun
            // qo'shimcha qoidalar kerak bo'lardi, APK hajmi esa muammo emas.
            isMinifyEnabled = false
            // Imzo: haqiqiy relesda o'z keystore'ingiz bilan imzolanadi
            // (README ga qarang). Hozircha debug imzosi bilan ham o'rnatiladi.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        // Versiyani ekranda ko'rsatish uchun (BuildConfig.VERSION_NAME) —
        // qaysi build o'rnatilganini bir qarashda bilish uchun kerak.
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)

    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.mlkit.barcode.scanning)

    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
}

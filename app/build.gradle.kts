plugins {
    id("com.android.application")
}

android {
    namespace = "com.donpinol.mishoras"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.donpinol.mishoras"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Sin firma: el APK release se firma después con la clave central DonPinol
            // (repo DonPinol-Firma). No firmar aquí.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.core:core:1.13.1")
}

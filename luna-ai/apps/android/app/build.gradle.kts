import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Chave de assinatura do APK: keystore/ (repositório privado) ou, se preferir, pelas variáveis
//   DIA_KEYSTORE=/caminho/dia.jks  DIA_KEYSTORE_PASSWORD=…  (alias “dia”)
// Atualizações só instalam por cima se forem assinadas com a mesma chave.
val repoKeystore = rootProject.file("keystore/keystore.properties")
val repoPassword: String? = if (repoKeystore.exists()) Properties().apply { repoKeystore.inputStream().use { load(it) } }.getProperty("storePassword") else null
val keystorePath: String? = System.getenv("DIA_KEYSTORE") ?: rootProject.file("keystore/dia.jks").takeIf { it.exists() }?.path
val keystorePassword: String? = System.getenv("DIA_KEYSTORE_PASSWORD") ?: repoPassword

android {
    namespace = "br.dia.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.dia.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 11
        versionName = "1.0.10"
        // Tablets Samsung usam ARM: deixa o APK menor
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
    }

    signingConfigs {
        if (keystorePath != null && keystorePassword != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = keystorePassword
                keyAlias = "dia"
                keyPassword = keystorePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures { buildConfig = true }
    // A verificação de estilo baixa muitas dependências e não muda o APK
    lint { checkReleaseBuilds = false }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { jniLibs { useLegacyPackaging = true } }
}

dependencies {
    // Reconhecimento de fala off-line (“Luna” sem internet e sem mandar áudio para fora)
    implementation("com.alphacephei:vosk-android:0.3.75@aar")
    implementation("net.java.dev.jna:jna:5.13.0@aar")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}

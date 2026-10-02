plugins { id("com.android.application") }

val productionOrigin = "https://familytodo.marinski1112.workers.dev"
val debugOrigin = providers.gradleProperty("familytodoDebugOrigin").orNull ?: productionOrigin
require(Regex("^https://[a-z0-9-]+\\.marinski1112\\.workers\\.dev$").matches(debugOrigin)) {
    "familytodoDebugOrigin must be an HTTPS Worker in the marinski1112 account (without a path)"
}
val previewBuild = debugOrigin != productionOrigin
val isolatedE2E = providers.gradleProperty("familytodoIsolatedE2E").orNull == "true"
require(!isolatedE2E || debugOrigin == "https://familytodo-android-e2e.marinski1112.workers.dev") {
    "Writable E2E builds require the dedicated familytodo-android-e2e origin"
}
val uiTestMode = providers.gradleProperty("familytodoUiTest").orNull == "true"
require(!uiTestMode || isolatedE2E) { "UI fixtures require the isolated E2E variant" }

val internalVersionCode = providers.gradleProperty("familytodoVersionCode").orNull?.let {
    it.toIntOrNull() ?: error("familytodoVersionCode must be an integer")
} ?: 1
require(internalVersionCode in 1..2_100_000_000) { "familytodoVersionCode must be a positive Android version code" }

android {
    namespace = "jp.marinski.familytodo"
    compileSdk = 35
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "jp.marinski.familytodo"
        minSdk = 26
        targetSdk = 35
        versionCode = internalVersionCode
        versionName = "0.1.$internalVersionCode"
        buildConfigField("String", "API_ORIGIN", "\"$productionOrigin\"")
        buildConfigField("boolean", "ALLOW_MUTATIONS", "true")
        buildConfigField("boolean", "UI_TEST_MODE", "false")
        testInstrumentationRunner = "jp.marinski.familytodo.UiParityInstrumentation"
        manifestPlaceholders["appLabel"] = "つちだけ"
    }
    buildTypes {
        getByName("debug") {
            buildConfigField("String", "API_ORIGIN", "\"$debugOrigin\"")
            buildConfigField("boolean", "UI_TEST_MODE", if (uiTestMode) "true" else "false")
            if (previewBuild) {
                buildConfigField("boolean", "ALLOW_MUTATIONS", if (isolatedE2E) "true" else "false")
                applicationIdSuffix = ".preview"
                manifestPlaceholders["appLabel"] = "つちだけ Preview"
            }
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

dependencies { implementation("com.google.android.gms:play-services-cast-framework:22.3.1") }

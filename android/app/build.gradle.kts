plugins { id("com.android.application") }

val productionOrigin = "https://familytodo.marinski1112.workers.dev"
val debugOrigin = providers.gradleProperty("familytodoDebugOrigin").orNull ?: productionOrigin
require(Regex("^https://[a-z0-9-]+\\.marinski1112\\.workers\\.dev$").matches(debugOrigin)) {
    "familytodoDebugOrigin must be an HTTPS Worker in the marinski1112 account (without a path)"
}
val previewBuild = debugOrigin != productionOrigin

android {
    namespace = "jp.marinski.familytodo"
    compileSdk = 35
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "jp.marinski.familytodo"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
        buildConfigField("String", "API_ORIGIN", "\"$productionOrigin\"")
        manifestPlaceholders["appLabel"] = "FamilyToDo"
    }
    buildTypes {
        getByName("debug") {
            buildConfigField("String", "API_ORIGIN", "\"$debugOrigin\"")
            if (previewBuild) {
                applicationIdSuffix = ".preview"
                manifestPlaceholders["appLabel"] = "FamilyToDo Preview"
            }
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

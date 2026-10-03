pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        val homeSdkRepository = providers.gradleProperty("familytodoHomeSdkRepository").orNull
        if (homeSdkRepository != null) maven {
            url = uri(homeSdkRepository)
            content { includeModule("com.google.android.gms", "play-services-home"); includeModule("com.google.android.gms", "play-services-home-types") }
        }
        google(); mavenCentral()
    }
}
rootProject.name = "FamilyToDoAndroid"
include(":app")

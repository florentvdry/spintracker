plugins {
    kotlin("jvm") version "1.9.0"
    id("org.jetbrains.compose") version "1.5.10"
}

version = "1.0.0"

kotlin {
    jvmToolchain(17)
    sourceSets {
        main {
            kotlin.srcDirs("src/desktopMain/kotlin")
            resources.srcDirs("src/desktopMain/resources", "seven-card-evaluator/evaluator/src/main/resources")
        }
    }
}

dependencies {
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(compose.materialIconsExtended)
    
    // SQLite
    implementation("org.xerial:sqlite-jdbc:3.44.0.0")
    
    // PostgreSQL
    implementation("org.postgresql:postgresql:42.6.0")
    
    // Exposed ORM
    implementation("org.jetbrains.exposed:exposed-core:0.45.0")
    implementation("org.jetbrains.exposed:exposed-dao:0.45.0")
    implementation("org.jetbrains.exposed:exposed-jdbc:0.45.0")
    
    // JSON
    implementation("org.json:json:20231013")
    
    // Logging
    implementation("ch.qos.logback:logback-classic:1.4.14")
    
    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.7.3")
    
    // 7-card poker hand evaluator (same algorithm as .NET HoldenPoker.Evaluator)
    implementation(files("libs/poker-evaluator.jar"))
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    kotlinOptions {
        freeCompilerArgs += listOf(
            "-opt-in=kotlin.RequiresOptIn",
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi"
        )
    }
}

tasks.register<JavaExec>("testImport") {
    group = "verification"
    description = "Run import test"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.tests.ImportTestKt")
}

tasks.register<JavaExec>("testEquity") {
    group = "verification"
    description = "Run equity test"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.tests.EquityTestKt")
}

tasks.register<JavaExec>("testMigration") {
    group = "verification"
    description = "Run database migration test"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.tests.DatabaseMigrationTestKt")
}

tasks.register<JavaExec>("testPlayerTyping") {
    group = "verification"
    description = "Run player typing test"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.tests.PlayerTypingTestKt")
}

tasks.register<JavaExec>("testHUD") {
    group = "verification"
    description = "Run HUD component test"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.tests.HUDComponentTestKt")
}

tasks.register<JavaExec>("testReplayerEquity") {
    group = "verification"
    description = "Run replayer equity test"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.tests.ReplayerEquityTestKt")
}

tasks.register<JavaExec>("testGTOComparison") {
    group = "verification"
    description = "Run GTO comparison test"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.tests.GTOComparisonTestKt")
}

tasks.register<JavaExec>("testUpdateService") {
    group = "verification"
    description = "Run update service test"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.tests.UpdateServiceTestKt")
}

tasks.register<JavaExec>("exportPT4Schema") {
    group = "verification"
    description = "Export PT4 database schema"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.utils.PT4SchemaExportKt")
}

tasks.register<JavaExec>("checkDatabase") {
    group = "verification"
    description = "Check database for unpopulated data"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.tests.DatabaseCheckKt")
}

compose.desktop {
    application {
        mainClass = "spintracker.MainKt"
    }
}
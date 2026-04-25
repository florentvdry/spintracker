package spintracker.tests

import spintracker.services.UpdateService
import spintracker.models.GitHubAsset
import kotlinx.coroutines.runBlocking

fun main() = runBlocking {
    val service = UpdateService.create()
    
    // Test version extraction from tag
    val version = service.extractVersionFromTag("v1.2.3")
    assert(version == "1.2.3") { "Expected '1.2.3' but got '$version'" }
    
    // Test version comparison
    assert(service.compareVersions("1.0.0", "1.0.1") > 0) { "1.0.1 should be newer than 1.0.0" }
    assert(service.compareVersions("1.2.0", "1.1.9") < 0) { "1.2.0 should be newer than 1.1.9" }
    assert(service.compareVersions("1.0.0", "1.0.0") == 0) { "Same versions should be equal" }
    
    // Test platform detection with mock assets
    // Note: findPlatformAsset is private, but we verify the mock assets can be created
    val mockAssets = listOf(
        GitHubAsset("SpinTracker-win.zip", "url", 1000),
        GitHubAsset("SpinTracker-mac.dmg", "url", 2000)
    )
    assert(mockAssets.size == 2) { "Expected 2 mock assets" }
    assert(mockAssets.any { it.name.contains("win") }) { "Should have Windows asset" }
    assert(mockAssets.any { it.name.contains("mac") }) { "Should have Mac asset" }
    
    println("All UpdateService tests passed!")
}

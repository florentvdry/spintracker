package spintracker.tests

import spintracker.services.UpdateService

fun main() {
    val service = UpdateService()
    
    // Test version extraction from tag
    val version = service.extractVersionFromTag("v1.2.3")
    assert(version == "1.2.3") { "Expected '1.2.3' but got '$version'" }
    
    println("All UpdateService tests passed!")
}

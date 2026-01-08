import { Button } from "@/components/ui/Button";
import { Download, Monitor, Apple } from "lucide-react";

export default function DownloadPage() {
  return (
    <div className="pt-32 pb-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 md:px-6 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400">
          Download PokerTracker
        </h1>
        <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
          Start your 30-day free trial today. No credit card required.
        </p>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Windows */}
          <div className="p-8 rounded-2xl bg-gray-900 border border-white/10 hover:border-blue-500/50 transition-colors flex flex-col items-center">
            <div className="h-16 w-16 bg-blue-600/10 rounded-full flex items-center justify-center mb-6">
              <Monitor className="h-8 w-8 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Windows</h2>
            <p className="text-gray-400 mb-8">Windows 10 or later (64-bit)</p>
            <Button size="lg" className="w-full">
              <Download className="mr-2 h-5 w-5" />
              Download for Windows
            </Button>
            <p className="mt-4 text-xs text-gray-500">Version 1.0.0 • 145 MB</p>
          </div>

          {/* macOS */}
          <div className="p-8 rounded-2xl bg-gray-900 border border-white/10 hover:border-gray-700 transition-colors flex flex-col items-center opacity-75">
            <div className="h-16 w-16 bg-gray-800 rounded-full flex items-center justify-center mb-6">
              <Apple className="h-8 w-8 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">macOS</h2>
            <p className="text-gray-400 mb-8">Coming Soon</p>
            <Button size="lg" variant="secondary" disabled className="w-full">
              <Download className="mr-2 h-5 w-5" />
              Not Available Yet
            </Button>
            <p className="mt-4 text-xs text-gray-500">Join waitlist for updates</p>
          </div>
        </div>

        <div className="mt-20 border-t border-white/10 pt-12 max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold text-white mb-6">System Requirements</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
            <div>
              <h4 className="font-semibold text-white mb-2">Minimum</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>• OS: Windows 10 (64-bit)</li>
                <li>• Processor: Intel Core i3 or equivalent</li>
                <li>• Memory: 4 GB RAM</li>
                <li>• Storage: 500 MB available space</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-2">Recommended</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>• OS: Windows 11 (64-bit)</li>
                <li>• Processor: Intel Core i5 or better</li>
                <li>• Memory: 8 GB RAM</li>
                <li>• Storage: SSD with 1 GB available space</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { motion } from "framer-motion";

export function Screenshots() {
  return (
    <section id="screenshots" className="py-20 md:py-32 bg-gray-950">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white">
            See it in Action
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl">
            A clean, intuitive interface designed to keep you focused on the action.
          </p>
        </div>

        <div className="space-y-24">
          {/* Feature 1 */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
             <div className="order-2 md:order-1">
                <h3 className="text-2xl font-bold text-white mb-4">Dynamic HUD</h3>
                <p className="text-gray-400 text-lg mb-6">
                  Our HUD adapts to the game state, showing you only the relevant stats when you need them. Fully customizable via drag-and-drop editor.
                </p>
                <ul className="space-y-2 text-gray-400">
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    Positional stats
                  </li>
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    Vs Hero stats
                  </li>
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    Live pot odds
                  </li>
                </ul>
             </div>
             <motion.div 
               initial={{ opacity: 0, x: 20 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               className="order-1 md:order-2 bg-gray-900 aspect-video rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden group"
             >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
                <span className="text-gray-600 font-medium">HUD Interface Screenshot</span>
             </motion.div>
          </div>

          {/* Feature 2 */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
             <motion.div 
               initial={{ opacity: 0, x: -20 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               className="bg-gray-900 aspect-video rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden"
             >
                <div className="absolute inset-0 bg-gradient-to-tr from-green-500/5 to-blue-500/5" />
                <span className="text-gray-600 font-medium">Hand Replayer Screenshot</span>
             </motion.div>
             <div>
                <h3 className="text-2xl font-bold text-white mb-4">Interactive Replayer</h3>
                <p className="text-gray-400 text-lg mb-6">
                  Review your sessions with our sleek hand replayer. Analyze every street, check equities, and take notes on opponents.
                </p>
                <ul className="space-y-2 text-gray-400">
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    Instant equity calculation
                  </li>
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    Range visualizer
                  </li>
                </ul>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
}

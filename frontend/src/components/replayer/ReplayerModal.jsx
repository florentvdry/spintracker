import React, { useState, useEffect, useRef } from 'react';
import { X, Minimize2, Maximize2, Move } from 'lucide-react';
import { useReplayerStore } from '../../stores/replayerStore';
import ReplayerTable from './ReplayerTable';
import ReplayerControls from './ReplayerControls';
import ReplayerTimeline from './ReplayerTimeline';

const ReplayerModal = () => {
  const { isOpen, closeReplayer, isMinimized, minimizeReplayer, isPlaying, nextStep, playbackSpeed } = useReplayerStore();
  const [position, setPosition] = useState({ x: 100, y: 50 });
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const modalRef = useRef(null);

  // Auto-play Loop
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        nextStep();
      }, 1000 / playbackSpeed); // Base speed 1s per action
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, nextStep]);

  // Handle Dragging
  const handleMouseDown = (e) => {
    if (e.target.closest('.no-drag')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
        if (isDragging) {
          // Calculate new position
          let newX = e.clientX - dragOffset.x;
          let newY = e.clientY - dragOffset.y;

          // Constrain to window bounds
          const maxX = window.innerWidth - size.width;
          const maxY = window.innerHeight - size.height;

          // Apply constraints
          newX = Math.max(0, Math.min(newX, maxX));
          newY = Math.max(0, Math.min(newY, maxY));

          setPosition({
            x: newX,
            y: newY
          });
        }
      };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Handle Window Resize to keep modal in bounds
  useEffect(() => {
    const handleWindowResize = () => {
      setPosition(prevPos => {
        const maxX = window.innerWidth - size.width;
        const maxY = window.innerHeight - size.height;
        
        // If current position is out of bounds, snap it back
        if (prevPos.x > maxX || prevPos.y > maxY) {
          return {
            x: Math.max(0, Math.min(prevPos.x, maxX)),
            y: Math.max(0, Math.min(prevPos.y, maxY))
          };
        }
        return prevPos;
      });
      
      // Also constrain size if window becomes smaller than modal
      setSize(prevSize => {
        if (prevSize.width > window.innerWidth || prevSize.height > window.innerHeight) {
          return {
            width: Math.min(prevSize.width, window.innerWidth),
            height: Math.min(prevSize.height, window.innerHeight)
          };
        }
        return prevSize;
      });
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [size]);

  // Handle Keyboard Navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') useReplayerStore.getState().nextStep();
      if (e.key === 'ArrowLeft') useReplayerStore.getState().prevStep();
      if (e.key === ' ') {
        e.preventDefault();
        useReplayerStore.getState().togglePlay();
      }
      if (e.key === 'Escape') closeReplayer();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg shadow-xl z-50 flex items-center gap-4 border border-gray-700">
        <span className="font-bold">Replayer</span>
        <button onClick={() => minimizeReplayer(false)} className="p-1 hover:bg-gray-700 rounded">
          <Maximize2 size={16} />
        </button>
        <button onClick={closeReplayer} className="p-1 hover:bg-gray-700 rounded">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div 
      ref={modalRef}
      style={{ 
        left: position.x, 
        top: position.y,
        width: size.width,
        height: size.height
      }}
      className="fixed bg-gray-900 text-gray-100 rounded-lg shadow-2xl z-50 flex flex-col border border-gray-700 overflow-hidden"
    >
      {/* Header */}
      <div 
        className="h-10 bg-gray-800 flex items-center justify-between px-4 cursor-move select-none border-b border-gray-700"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <Move size={14} className="text-gray-400" />
          <span className="font-semibold text-sm">Hand Replayer</span>
        </div>
        <div className="flex items-center gap-2 no-drag">
          <button onClick={() => minimizeReplayer(true)} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
            <Minimize2 size={14} />
          </button>
          <button onClick={closeReplayer} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Table Area */}
        <div className="flex-1 relative bg-gray-950 flex flex-col">
          <div className="flex-1 relative">
            <ReplayerTable />
          </div>
          <div className="h-16 bg-gray-900 border-t border-gray-800">
            <ReplayerControls />
          </div>
        </div>

        {/* Sidebar Timeline */}
        <div className="w-64 bg-gray-900 border-l border-gray-800 overflow-y-auto">
          <ReplayerTimeline />
        </div>
      </div>
      
      {/* Resizer Handle (Simple) */}
      <div 
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-50 no-drag"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startY = e.clientY;
          const startWidth = size.width;
          const startHeight = size.height;

          const onMove = (moveEvent) => {
            const newWidth = Math.max(600, startWidth + moveEvent.clientX - startX);
            const newHeight = Math.max(400, startHeight + moveEvent.clientY - startY);
            
            // Constrain to window bounds
            const maxWidth = window.innerWidth - position.x;
            const maxHeight = window.innerHeight - position.y;

            setSize({
              width: Math.min(newWidth, maxWidth),
              height: Math.min(newHeight, maxHeight)
            });
          };

          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };

          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      />
    </div>
  );
};

export default ReplayerModal;

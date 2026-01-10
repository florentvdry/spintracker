import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Save, Trash2, Edit2, GripVertical, Type, X, Layout, Download, Upload, Settings, Palette, AlignLeft, AlignCenter, AlignRight, RefreshCw } from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Item Types for DnD
const ItemTypes = {
  STAT: 'stat',
  TEXT: 'text',
  CELL: 'cell' // For moving items within grid
};

const DraggableStat = ({ stat }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.STAT,
    item: { type: 'stat', id: stat.id, name: stat.name, definition: stat.definition },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div ref={drag} className={`p-3 bg-slate-800 border border-slate-700 rounded-md mb-2 cursor-move flex items-center gap-3 hover:bg-slate-700 transition-colors ${isDragging ? 'opacity-50' : ''}`}>
      <GripVertical size={16} className="text-slate-500" />
      <span className="text-sm font-medium truncate text-slate-200">{stat.name}</span>
    </div>
  );
};

const DraggableTextTool = () => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.TEXT,
    item: { type: 'text', content: 'Label' },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div ref={drag} className={`p-3 bg-slate-800 border border-slate-700 rounded-md mb-2 cursor-move flex items-center gap-3 hover:bg-slate-700 transition-colors ${isDragging ? 'opacity-50' : ''}`}>
      <Type size={16} className="text-slate-500" />
      <span className="text-sm font-medium text-slate-200">Text Label</span>
    </div>
  );
};

const GridCell = ({ row, col, item, onDrop, onSelect, isSelected, value }) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: [ItemTypes.STAT, ItemTypes.TEXT],
    drop: (droppedItem) => onDrop(row, col, droppedItem),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }), [onDrop, row, col]);

  // Styles from item properties
  const style = {
    fontSize: item?.style?.fontSize || (item?.type === 'text' ? '14px' : '18px'),
    color: item?.style?.color || (item?.type === 'text' ? '#cbd5e1' : '#60a5fa'),
    backgroundColor: item?.style?.backgroundColor || 'transparent',
    textAlign: item?.style?.textAlign || 'center',
    fontWeight: item?.style?.fontWeight || 'bold',
  };

  return (
    <div 
      ref={drop} 
      onClick={() => onSelect(row, col)}
      className={`
        relative border min-h-[60px] flex flex-col justify-center p-1 transition-all cursor-pointer overflow-hidden
        ${isSelected ? 'ring-2 ring-blue-500 z-10 border-blue-500 bg-blue-500/10' : 'border-slate-800/50 hover:bg-slate-800/30'}
        ${isOver ? 'bg-blue-500/20 border-blue-500 border-dashed' : 'bg-slate-900/50'}
      `}
      style={{ backgroundColor: style.backgroundColor }}
    >
      {item ? (
        <div className="w-full h-full flex flex-col justify-center pointer-events-none" style={{ textAlign: style.textAlign }}>
          {item.type === 'text' ? (
            <span style={{ ...style }}>{item.content}</span>
          ) : (
            <>
              {/* Stat Label */}
              {(item.label || item.name) && (
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5 truncate block">
                      {item.label || item.name}
                  </span>
              )}
              {/* Stat Value */}
              <span style={{ ...style }}>
                {typeof value === 'number' 
                    ? value.toFixed(item?.style?.decimals || 1) 
                    : value}
                {item?.type === 'stat' && typeof value === 'number' && '%'}
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="text-slate-800 text-xs pointer-events-none flex items-center justify-center opacity-0 hover:opacity-100">+</div>
      )}
    </div>
  );
};

export default function AnalysisHUD({ filters }) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [currentLayout, setCurrentLayout] = useState([]);
  const [availableStats, setAvailableStats] = useState([]);
  const [statValues, setStatValues] = useState({}); // { statId: { value, opportunities, successes } }
  const [loadingValues, setLoadingValues] = useState(false);
  
  // Selection for Properties Panel
  const [selectedCell, setSelectedCell] = useState(null); // { row, col }

  // Load Initial Data
  useEffect(() => {
    loadProfiles();
    loadStats();
  }, []);

  // Evaluate Stats when Layout or Filters change (and not editing)
  useEffect(() => {
    if (!isEditing && currentLayout.length > 0) {
      evaluateStats();
    }
  }, [isEditing, filters]);

  // Debounced evaluation could be better, but explicit refresh is safer for perf
  const loadProfiles = async () => {
    try {
      const res = await fetch('http://localhost:5050/hud-profiles');
      const json = await res.json();
      if (json.success) {
        setProfiles(json.data);
        const active = json.data.find(p => p.isActive) || json.data[0];
        if (active) {
          setActiveProfileId(active.id);
          setCurrentLayout(active.layout || []);
        } else {
            handleNewProfile();
        }
      }
    } catch (err) {
      console.error("Failed to load profiles", err);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch('http://localhost:5050/stats');
      const json = await res.json();
      if (json.success) setAvailableStats(json.data);
    } catch (err) { console.error(err); }
  };

  const evaluateStats = async () => {
    const statsToEval = currentLayout
        .filter(item => item.type === 'stat')
        .map(item => ({
            id: item.id,
            name: item.name,
            ...item.definition
        }));

    if (statsToEval.length === 0) return;

    setLoadingValues(true);
    try {
        const payload = {
            stats: statsToEval,
            filters: filters
        };
        
        const res = await fetch('http://localhost:5050/stats/builder/evaluate-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        
        if (json.success) {
            setStatValues(json.data);
        }
    } catch (err) {
        console.error("Evaluation failed", err);
    } finally {
        setLoadingValues(false);
    }
  };

  const handleNewProfile = () => {
    const newProfile = {
        id: 'temp-' + Date.now(),
        name: 'New HUD Profile',
        layout: [],
        isActive: true
    };
    setProfiles([...profiles, newProfile]);
    setActiveProfileId(newProfile.id);
    setCurrentLayout([]);
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    const profile = profiles.find(p => p.id === activeProfileId);
    if (!profile) return;

    try {
        const payload = {
            id: profile.id.startsWith('temp-') ? null : profile.id,
            name: profile.name,
            layout: currentLayout,
            isActive: true
        };

        const res = await fetch('http://localhost:5050/hud-profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
            alert('Profile saved');
            const savedId = json.id;
            const updatedProfiles = profiles.map(p => 
                p.id === profile.id ? { ...payload, id: savedId } : p
            );
            setProfiles(updatedProfiles);
            setActiveProfileId(savedId);
            setIsEditing(false);
            setSelectedCell(null);
        }
    } catch (err) {
        alert('Save failed: ' + err.message);
    }
  };

  const handleDeleteProfile = async () => {
    if (!confirm('Delete this profile?')) return;
    try {
        await fetch(`http://localhost:5050/hud-profiles/${activeProfileId}`, { method: 'DELETE' });
        loadProfiles();
    } catch (err) { alert('Delete failed'); }
  };

  // --- Grid Logic ---
  const GRID_ROWS = 8;
  const GRID_COLS = 8;

  const handleDropItem = (row, col, item) => {
    const existingIdx = currentLayout.findIndex(i => i.row === row && i.col === col);
    let newLayout = [...currentLayout];
    
    if (existingIdx >= 0) newLayout.splice(existingIdx, 1);

    newLayout.push({
        ...item,
        row,
        col,
        style: item.style || {} // Preserve style if moving
    });
    setCurrentLayout(newLayout);
    setSelectedCell({ row, col });
  };

  const handleRemoveItem = (row, col) => {
      setCurrentLayout(currentLayout.filter(i => !(i.row === row && i.col === col)));
      setSelectedCell(null);
  };

  const handleUpdateSelectedItem = (updates) => {
      if (!selectedCell) return;
      setCurrentLayout(currentLayout.map(item => {
          if (item.row === selectedCell.row && item.col === selectedCell.col) {
              return { ...item, ...updates };
          }
          return item;
      }));
  };

  const getSelectedItem = () => {
      if (!selectedCell) return null;
      return currentLayout.find(i => i.row === selectedCell.row && i.col === selectedCell.col);
  };

  const selectedItem = getSelectedItem();

  return (
    <DndProvider backend={HTML5Backend}>
        <div className="flex h-full bg-slate-950 text-slate-200">
            {/* 1. Sidebar (Editor Tools) - Left */}
            {isEditing && (
                <div className="w-64 bg-slate-900/50 border-r border-slate-800 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-800">
                        <h3 className="font-bold text-slate-100 flex items-center gap-2">
                            <Layout size={18} className="text-blue-500" />
                            HUD Elements
                        </h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        <div className="mb-6">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tools</h4>
                            <DraggableTextTool />
                        </div>
                        
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Custom Stats</h4>
                            {availableStats.map(s => (
                                <DraggableStat key={s.id} stat={s} />
                            ))}
                            {availableStats.length === 0 && <div className="text-xs text-slate-600 italic">No stats created yet.</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* 2. Main Area - Center */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Toolbar */}
                <div className="h-16 border-b border-slate-800 bg-slate-900 px-6 flex items-center justify-between shadow-sm z-20">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Active Profile</span>
                            <div className="flex items-center gap-2">
                                {isEditing ? (
                                    <input 
                                        value={profiles.find(p => p.id === activeProfileId)?.name || ''}
                                        onChange={(e) => {
                                            const newName = e.target.value;
                                            setProfiles(profiles.map(p => p.id === activeProfileId ? { ...p, name: newName } : p));
                                        }}
                                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none w-48 font-medium text-white"
                                        placeholder="Profile Name"
                                    />
                                ) : (
                                    <select 
                                        value={activeProfileId || ''} 
                                        onChange={(e) => {
                                            const pid = e.target.value;
                                            setActiveProfileId(pid);
                                            const p = profiles.find(x => x.id === pid);
                                            if (p) setCurrentLayout(p.layout || []);
                                        }}
                                        className="bg-transparent text-lg font-bold text-white outline-none cursor-pointer hover:text-blue-400 transition-colors"
                                    >
                                        {profiles.map(p => <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>)}
                                    </select>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {!isEditing ? (
                            <>
                                <button onClick={() => evaluateStats()} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors" title="Refresh Data">
                                    <RefreshCw size={18} className={loadingValues ? 'animate-spin' : ''} />
                                </button>
                                <div className="h-6 w-px bg-slate-700 mx-2"></div>
                                <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors border border-slate-700">
                                    <Edit2 size={16} /> Edit HUD
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-md text-slate-400 hover:text-white text-sm font-medium transition-colors">
                                    Cancel
                                </button>
                                <button onClick={handleSaveProfile} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-md font-medium text-sm transition-colors shadow-lg shadow-emerald-900/20">
                                    <Save size={16} /> Save Changes
                                </button>
                            </>
                        )}
                        
                        <div className="h-6 w-px bg-slate-700 mx-2"></div>

                        <button onClick={handleNewProfile} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors" title="New Profile">
                            <Plus size={18} />
                        </button>
                        <button onClick={handleDeleteProfile} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-red-400 transition-colors" title="Delete Profile">
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>

                {/* Grid Canvas */}
                <div className="flex-1 p-8 overflow-auto flex justify-center bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-opacity-5">
                    <div 
                        className="relative grid gap-0 bg-slate-900/80 backdrop-blur-sm border border-slate-700 shadow-2xl rounded-xl overflow-hidden"
                        style={{
                            gridTemplateColumns: `repeat(${GRID_COLS}, 100px)`,
                            gridTemplateRows: `repeat(${GRID_ROWS}, 60px)`,
                            width: 'fit-content',
                            height: 'fit-content'
                        }}
                    >
                        {/* Grid Lines Overlay */}
                        <div className="absolute inset-0 pointer-events-none z-0 opacity-20" 
                             style={{ 
                                 backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`,
                                 backgroundSize: '100px 60px'
                             }}>
                        </div>

                        {Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, idx) => {
                            const row = Math.floor(idx / GRID_COLS);
                            const col = idx % GRID_COLS;
                            const item = currentLayout.find(i => i.row === row && i.col === col);
                            const isSelected = selectedCell?.row === row && selectedCell?.col === col;
                            
                            let value = '-';
                            if (item?.type === 'stat') {
                                const key = item.id || item.name;
                                const result = statValues[key];
                                if (loadingValues) value = '...';
                                else if (result) value = result.value;
                            }

                            return (
                                <GridCell 
                                    key={`${row}-${col}`} 
                                    row={row} 
                                    col={col} 
                                    item={item} 
                                    value={value}
                                    isSelected={isSelected && isEditing}
                                    onSelect={(r, c) => isEditing && setSelectedCell({ row: r, col: c })}
                                    onDrop={handleDropItem}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 3. Properties Panel (Right) - Editor Only */}
            {isEditing && selectedItem && (
                <div className="w-72 bg-slate-900 border-l border-slate-800 flex flex-col animate-in slide-in-from-right-10 duration-200 shadow-2xl z-30">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                        <h3 className="font-bold text-slate-100 flex items-center gap-2">
                            <Settings size={18} className="text-blue-500" />
                            Properties
                        </h3>
                        <button onClick={() => setSelectedCell(null)} className="text-slate-500 hover:text-white">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                        {/* Content Section */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Content</label>
                            {selectedItem.type === 'text' ? (
                                <input 
                                    value={selectedItem.content || ''}
                                    onChange={(e) => handleUpdateSelectedItem({ content: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none text-white"
                                    placeholder="Text Content"
                                />
                            ) : (
                                <input 
                                    value={selectedItem.label || selectedItem.name || ''}
                                    onChange={(e) => handleUpdateSelectedItem({ label: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none text-white"
                                    placeholder="Label Override"
                                />
                            )}
                        </div>

                        <div className="h-px bg-slate-800"></div>

                        {/* Typography Section */}
                        <div className="space-y-4">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                <Palette size={12} /> Appearance
                            </label>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] text-slate-400 mb-1 block">Font Size</label>
                                    <select 
                                        value={selectedItem.style?.fontSize || '14px'}
                                        onChange={(e) => handleUpdateSelectedItem({ style: { ...selectedItem.style, fontSize: e.target.value } })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs outline-none"
                                    >
                                        {[10, 12, 14, 16, 18, 20, 24, 32].map(s => <option key={s} value={`${s}px`}>{s}px</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 mb-1 block">Color</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="color" 
                                            value={selectedItem.style?.color || '#ffffff'}
                                            onChange={(e) => handleUpdateSelectedItem({ style: { ...selectedItem.style, color: e.target.value } })}
                                            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                                        />
                                        <span className="text-xs text-slate-500 font-mono">{selectedItem.style?.color}</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] text-slate-400 mb-1 block">Background</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="color" 
                                        value={selectedItem.style?.backgroundColor || '#000000'}
                                        onChange={(e) => handleUpdateSelectedItem({ style: { ...selectedItem.style, backgroundColor: e.target.value } })}
                                        className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                                    />
                                    <button 
                                        onClick={() => handleUpdateSelectedItem({ style: { ...selectedItem.style, backgroundColor: 'transparent' } })}
                                        className="text-[10px] text-slate-500 hover:text-white underline"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] text-slate-400 mb-1 block">Alignment</label>
                                <div className="flex bg-slate-800 rounded p-1 border border-slate-700">
                                    {['left', 'center', 'right'].map(align => (
                                        <button
                                            key={align}
                                            onClick={() => handleUpdateSelectedItem({ style: { ...selectedItem.style, textAlign: align } })}
                                            className={`flex-1 p-1 rounded flex justify-center ${selectedItem.style?.textAlign === align ? 'bg-slate-700 text-blue-400' : 'text-slate-500 hover:text-white'}`}
                                        >
                                            {align === 'left' && <AlignLeft size={14} />}
                                            {align === 'center' && <AlignCenter size={14} />}
                                            {align === 'right' && <AlignRight size={14} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Stat Specific Options */}
                        {selectedItem.type === 'stat' && (
                            <>
                                <div className="h-px bg-slate-800"></div>
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Format</label>
                                    <div>
                                        <label className="text-[10px] text-slate-400 mb-1 block">Decimals</label>
                                        <input 
                                            type="number" 
                                            min="0" max="4"
                                            value={selectedItem.style?.decimals ?? 1}
                                            onChange={(e) => handleUpdateSelectedItem({ style: { ...selectedItem.style, decimals: parseInt(e.target.value) } })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs outline-none text-white"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="pt-6">
                            <button 
                                onClick={() => handleRemoveItem(selectedCell.row, selectedCell.col)}
                                className="w-full py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 text-sm"
                            >
                                <Trash2 size={14} /> Remove Element
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </DndProvider>
  );
}

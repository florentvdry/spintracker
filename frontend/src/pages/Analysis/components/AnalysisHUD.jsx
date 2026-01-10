import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Save, Trash2, Edit2, GripVertical, Type, X, Layout, Download, Upload, Settings, Palette, AlignLeft, AlignCenter, AlignRight, RefreshCw, ChevronDown } from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import clsx from 'clsx';

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
    <div ref={drag} className={clsx(
        "p-2.5 bg-dark-400 border border-dark-200 rounded-md mb-2 cursor-move flex items-center gap-3 hover:bg-dark-300 transition-colors group",
        isDragging && "opacity-50 ring-2 ring-primary-500"
    )}>
      <GripVertical size={14} className="text-gray-500 group-hover:text-gray-300 transition-colors" />
      <span className="text-sm font-medium truncate text-gray-300 group-hover:text-white">{stat.name}</span>
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
    <div ref={drag} className={clsx(
        "p-2.5 bg-dark-400 border border-dark-200 rounded-md mb-2 cursor-move flex items-center gap-3 hover:bg-dark-300 transition-colors group",
        isDragging && "opacity-50 ring-2 ring-primary-500"
    )}>
      <Type size={14} className="text-gray-500 group-hover:text-gray-300 transition-colors" />
      <span className="text-sm font-medium text-gray-300 group-hover:text-white">Text Label</span>
    </div>
  );
};

const GridCell = ({ row, col, item, onDrop, onSelect, isSelected, value, isEditing }) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: [ItemTypes.STAT, ItemTypes.TEXT],
    drop: (droppedItem) => onDrop(row, col, droppedItem),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }), [onDrop, row, col]);

  // Styles from item properties
  const style = {
    fontSize: item?.style?.fontSize || (item?.type === 'text' ? '14px' : '16px'),
    color: item?.style?.color || (item?.type === 'text' ? '#9ca3af' : '#e2e8f0'), // gray-400 for text, slate-200 for stats
    backgroundColor: item?.style?.backgroundColor || 'transparent',
    textAlign: item?.style?.textAlign || 'center',
    fontWeight: item?.style?.fontWeight || (item?.type === 'text' ? 'normal' : '600'),
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  };

  return (
    <div 
      ref={drop} 
      onClick={() => isEditing && onSelect(row, col)}
      className={clsx(
        "relative flex flex-col justify-center p-1 transition-all overflow-hidden",
        isEditing ? "border border-dark-200 min-h-[60px] cursor-pointer hover:bg-dark-300/50" : "min-h-[40px]",
        isSelected && isEditing && "ring-2 ring-primary-500 z-10 border-primary-500 bg-primary-500/10",
        isOver && "bg-primary-500/20 border-primary-500 border-dashed"
      )}
      style={{ backgroundColor: style.backgroundColor }}
    >
      {item ? (
        <div className="w-full h-full flex flex-col justify-center pointer-events-none" style={{ textAlign: style.textAlign }}>
          {item.type === 'text' ? (
            <span style={{ ...style }} className="leading-tight">{item.content}</span>
          ) : (
            <>
            {/* Stat Label */}
            {item.showLabel !== false && (item.label || item.name) && (
                <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-0.5 truncate block opacity-70 font-semibold">
                    {item.label || item.name}
                </span>
            )}
              {/* Stat Value */}
              <span style={{ ...style }} className="tracking-tight">
                {typeof value === 'number' 
                    ? value.toFixed(item?.style?.decimals || 1) 
                    : value}
                {item?.type === 'stat' && typeof value === 'number' && <span className="text-[0.7em] opacity-50 ml-px">%</span>}
              </span>
            </>
          )}
        </div>
      ) : (
        isEditing && <div className="text-dark-200 text-xs pointer-events-none flex items-center justify-center opacity-0 hover:opacity-100">+</div>
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
        name: 'New Stats Profile',
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
  const GRID_ROWS = 12; // Increased for more detailed layouts
  const GRID_COLS = 16;

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
        <div className="flex h-full bg-dark-500 text-gray-200 rounded-xl overflow-hidden border border-dark-300">
            {/* 1. Sidebar (Editor Tools) - Left */}
            {isEditing && (
                <div className="w-72 bg-dark-400 border-r border-dark-200 flex flex-col overflow-hidden animate-in slide-in-from-left-4 duration-300">
                    <div className="p-5 border-b border-dark-200 bg-dark-300">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Layout size={18} className="text-primary-500" />
                            {t('analysis.hud.elements')}
                        </h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        <div className="mb-6">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">{t('analysis.hud.tools')}</h4>
                            <DraggableTextTool />
                        </div>
                        
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">{t('analysis.hud.available_stats')}</h4>
                            <div className="space-y-1">
                                {availableStats.map(s => (
                                    <DraggableStat key={s.id} stat={s} />
                                ))}
                                {availableStats.length === 0 && <div className="text-xs text-gray-500 italic px-1">No stats created yet.</div>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. Main Area - Center */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {/* Toolbar */}
                <div className="h-14 border-b border-dark-200 bg-dark-300 px-6 flex items-center justify-between z-20 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                            {isEditing ? (
                                <input 
                                    value={profiles.find(p => p.id === activeProfileId)?.name || ''}
                                    onChange={(e) => {
                                        const newName = e.target.value;
                                        setProfiles(profiles.map(p => p.id === activeProfileId ? { ...p, name: newName } : p));
                                    }}
                                    className="bg-dark-400 border border-dark-200 rounded px-3 py-1.5 text-sm focus:border-primary-500 outline-none w-56 font-semibold text-white transition-all"
                                    placeholder="Profile Name"
                                />
                            ) : (
                                <div className="relative group">
                                    <div className="flex items-center gap-2 cursor-pointer">
                                        <select 
                                            value={activeProfileId || ''} 
                                            onChange={(e) => {
                                                const pid = e.target.value;
                                                setActiveProfileId(pid);
                                                const p = profiles.find(x => x.id === pid);
                                                if (p) setCurrentLayout(p.layout || []);
                                            }}
                                            className="appearance-none bg-transparent text-lg font-bold text-white outline-none cursor-pointer hover:text-primary-400 transition-colors pr-8 py-1"
                                        >
                                            {profiles.map(p => <option key={p.id} value={p.id} className="bg-dark-300 text-gray-200">{p.name}</option>)}
                                        </select>
                                        <ChevronDown size={14} className="text-gray-500 absolute right-0 pointer-events-none group-hover:text-primary-400 transition-colors" />
                                    </div>
                                    <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider absolute -top-2 left-0">{t('analysis.hud.profile')}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {!isEditing ? (
                            <>
                                <button onClick={() => evaluateStats()} className="p-2 hover:bg-dark-400 rounded-md text-gray-400 hover:text-white transition-colors" title="Refresh Data">
                                    <RefreshCw size={18} className={loadingValues ? 'animate-spin' : ''} />
                                </button>
                                <div className="h-5 w-px bg-dark-200 mx-1"></div>
                                <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 bg-dark-400 hover:bg-dark-200 text-gray-200 px-3 py-1.5 rounded-md font-medium text-xs transition-all border border-dark-200 hover:border-dark-100">
                                    <Edit2 size={14} /> {t('analysis.hud.edit_mode')}
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-md text-gray-400 hover:text-white text-xs font-medium transition-colors">
                                    {t('common.cancel')}
                                </button>
                                <button onClick={handleSaveProfile} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-1.5 rounded-md font-medium text-xs transition-colors shadow-lg shadow-primary-900/20">
                                    <Save size={14} /> {t('analysis.hud.save_changes')}
                                </button>
                            </>
                        )}
                        
                        <div className="h-5 w-px bg-dark-200 mx-1"></div>

                        <button onClick={handleNewProfile} className="p-2 hover:bg-dark-400 rounded-md text-gray-400 hover:text-white transition-colors" title="New Profile">
                            <Plus size={18} />
                        </button>
                        <button onClick={handleDeleteProfile} className="p-2 hover:bg-dark-400 rounded-md text-gray-400 hover:text-red-400 transition-colors" title="Delete Profile">
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>

                {/* Grid Canvas */}
                <div className="flex-1 p-8 overflow-auto flex justify-center bg-dark-500">
                    <div 
                        className={clsx(
                            "relative grid gap-0 transition-all duration-300",
                            isEditing ? "bg-dark-400/50 border border-dark-200 rounded-xl shadow-2xl p-4" : ""
                        )}
                        style={{
                            gridTemplateColumns: `repeat(${GRID_COLS}, ${isEditing ? '100px' : 'minmax(80px, auto)'})`,
                            gridTemplateRows: `repeat(${GRID_ROWS}, ${isEditing ? '60px' : 'auto'})`,
                            width: 'fit-content',
                            height: 'fit-content'
                        }}
                    >
                        {/* Grid Lines Overlay - Only in Edit Mode */}
                        {isEditing && (
                            <div className="absolute inset-4 pointer-events-none z-0 opacity-10" 
                                 style={{ 
                                     backgroundImage: `linear-gradient(to right, #4b5563 1px, transparent 1px), linear-gradient(to bottom, #4b5563 1px, transparent 1px)`,
                                     backgroundSize: '100px 60px'
                                 }}>
                            </div>
                        )}

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
                                    isEditing={isEditing}
                                    isSelected={isSelected && isEditing}
                                    onSelect={(r, c) => isEditing && setSelectedCell({ row: r, col: c })}
                                    onDrop={handleDropItem}
                                />
                            );
                        })}
                        
                        {/* Empty State Guide */}
                        {!isEditing && currentLayout.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <div className="bg-dark-300/80 backdrop-blur-sm p-6 rounded-xl border border-dark-200 flex flex-col items-center max-w-sm text-center shadow-2xl">
                                    <div className="p-3 bg-dark-400 rounded-full mb-4">
                                        <Layout size={32} className="text-primary-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2">{t('analysis.hud.no_stats')}</h3>
                                    <p className="text-sm text-gray-400 mb-6">
                                        {t('analysis.hud.editor_guide')}
                                    </p>
                                    <button 
                                        onClick={() => setIsEditing(true)} 
                                        className="pointer-events-auto flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-all shadow-lg hover:shadow-primary-900/30 hover:-translate-y-0.5"
                                    >
                                        <Edit2 size={16} /> {t('analysis.hud.edit_mode')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 3. Properties Panel (Right) - Editor Only */}
            {isEditing && selectedItem && (
                <div className="w-72 bg-dark-400 border-l border-dark-200 flex flex-col animate-in slide-in-from-right-10 duration-200 shadow-2xl z-30">
                    <div className="p-4 border-b border-dark-200 flex justify-between items-center bg-dark-300">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Settings size={18} className="text-primary-500" />
                            {t('analysis.hud.properties')}
                        </h3>
                        <button onClick={() => setSelectedCell(null)} className="text-gray-500 hover:text-white transition-colors">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                        {/* Content Section */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('analysis.hud.content')}</label>
                            {selectedItem.type === 'text' ? (
                                <input 
                                    value={selectedItem.content || ''}
                                    onChange={(e) => handleUpdateSelectedItem({ content: e.target.value })}
                                    className="w-full bg-dark-300 border border-dark-200 rounded px-3 py-2 text-sm focus:border-primary-500 outline-none text-white transition-all"
                                    placeholder="Text Content"
                                />
                            ) : (
                                <input 
                                    value={selectedItem.label || selectedItem.name || ''}
                                    onChange={(e) => handleUpdateSelectedItem({ label: e.target.value })}
                                    className="w-full bg-dark-300 border border-dark-200 rounded px-3 py-2 text-sm focus:border-primary-500 outline-none text-white transition-all"
                                    placeholder="Label Override"
                                />
                            )}
                        </div>

                        <div className="h-px bg-dark-200"></div>

                        {/* Typography Section */}
                        <div className="space-y-4">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Palette size={12} /> {t('analysis.hud.appearance')}
                            </label>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] text-gray-400 mb-1 block">{t('analysis.hud.font_size')}</label>
                                    <select 
                                        value={selectedItem.style?.fontSize || '16px'}
                                        onChange={(e) => handleUpdateSelectedItem({ style: { ...selectedItem.style, fontSize: e.target.value } })}
                                        className="w-full bg-dark-300 border border-dark-200 rounded px-2 py-1.5 text-xs outline-none text-white"
                                    >
                                        {[10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 32].map(s => <option key={s} value={`${s}px`}>{s}px</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400 mb-1 block">{t('analysis.hud.color')}</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="color" 
                                            value={selectedItem.style?.color || '#ffffff'}
                                            onChange={(e) => handleUpdateSelectedItem({ style: { ...selectedItem.style, color: e.target.value } })}
                                            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                                        />
                                        <span className="text-xs text-gray-500 font-mono">{selectedItem.style?.color}</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] text-gray-400 mb-1 block">{t('analysis.hud.background')}</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="color" 
                                        value={selectedItem.style?.backgroundColor || '#000000'}
                                        onChange={(e) => handleUpdateSelectedItem({ style: { ...selectedItem.style, backgroundColor: e.target.value } })}
                                        className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                                    />
                                    <button 
                                        onClick={() => handleUpdateSelectedItem({ style: { ...selectedItem.style, backgroundColor: 'transparent' } })}
                                        className="text-[10px] text-gray-500 hover:text-white underline"
                                    >
                                        {t('common.clear', 'Clear')}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] text-gray-400 mb-1 block">{t('analysis.hud.alignment')}</label>
                                <div className="flex bg-dark-300 rounded p-1 border border-dark-200">
                                    {['left', 'center', 'right'].map(align => (
                                        <button
                                            key={align}
                                            onClick={() => handleUpdateSelectedItem({ style: { ...selectedItem.style, textAlign: align } })}
                                            className={`flex-1 p-1 rounded flex justify-center transition-colors ${selectedItem.style?.textAlign === align ? 'bg-dark-200 text-primary-400' : 'text-gray-500 hover:text-white'}`}
                                        >
                                            {align === 'left' && <AlignLeft size={14} />}
                                            {align === 'center' && <AlignCenter size={14} />}
                                            {align === 'right' && <AlignRight size={14} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-[10px] text-gray-400 mb-1 block">{t('analysis.hud.font_weight')}</label>
                                <div className="flex bg-dark-300 rounded p-1 border border-dark-200">
                                    {['normal', 'bold'].map(weight => (
                                        <button
                                            key={weight}
                                            onClick={() => handleUpdateSelectedItem({ style: { ...selectedItem.style, fontWeight: weight } })}
                                            className={`flex-1 p-1 rounded flex justify-center text-xs transition-colors ${selectedItem.style?.fontWeight === weight ? 'bg-dark-200 text-primary-400' : 'text-gray-500 hover:text-white'}`}
                                        >
                                            {weight === 'normal' ? 'Normal' : 'Bold'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Stat Specific Options */}
                        {selectedItem.type === 'stat' && (
                            <>
                                <div className="h-px bg-dark-200"></div>
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('analysis.hud.format')}</label>
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-1 block">{t('analysis.hud.decimals')}</label>
                                        <input 
                                            type="number" 
                                            min="0" max="4"
                                            value={selectedItem.style?.decimals ?? 1}
                                            onChange={(e) => handleUpdateSelectedItem({ style: { ...selectedItem.style, decimals: parseInt(e.target.value) } })}
                                            className="w-full bg-dark-300 border border-dark-200 rounded px-2 py-1.5 text-xs outline-none text-white"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="pt-6">
                            <button 
                                onClick={() => handleRemoveItem(selectedCell.row, selectedCell.col)}
                                className="w-full py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                            >
                                <Trash2 size={14} /> {t('analysis.hud.remove_element')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </DndProvider>
  );
}

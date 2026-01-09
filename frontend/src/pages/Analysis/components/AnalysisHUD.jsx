import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Save, Trash2, Edit2, GripVertical, Type, X, Layout, Download, Upload } from 'lucide-react';
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
    <div ref={drag} className={`p-2 bg-slate-800 border border-slate-700 rounded mb-2 cursor-move flex items-center gap-2 ${isDragging ? 'opacity-50' : ''}`}>
      <GripVertical size={14} className="text-slate-500" />
      <span className="text-xs font-medium truncate">{stat.name}</span>
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
    <div ref={drag} className={`p-2 bg-slate-800 border border-slate-700 rounded mb-2 cursor-move flex items-center gap-2 ${isDragging ? 'opacity-50' : ''}`}>
      <Type size={14} className="text-slate-500" />
      <span className="text-xs font-medium">Text Label</span>
    </div>
  );
};

const GridCell = ({ row, col, item, onDrop, onRemove, onUpdate, value }) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: [ItemTypes.STAT, ItemTypes.TEXT],
    drop: (droppedItem) => onDrop(row, col, droppedItem),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }), [onDrop, row, col]);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item?.label || item?.content || '');

  const handleBlur = () => {
    setIsEditing(false);
    if (item.type === 'text') onUpdate(row, col, { ...item, content: editValue });
    else onUpdate(row, col, { ...item, label: editValue });
  };

  return (
    <div 
      ref={drop} 
      className={`
        relative border border-slate-700/50 min-h-[60px] flex flex-col items-center justify-center p-1 transition-colors
        ${isOver ? 'bg-blue-500/20 border-blue-500' : 'bg-slate-900/50 hover:bg-slate-800/50'}
      `}
    >
      {item ? (
        <div className="w-full h-full flex flex-col items-center justify-center group">
          {/* Controls */}
          <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 flex bg-slate-900 rounded border border-slate-700 z-10">
             <button onClick={() => { setEditValue(item.type === 'text' ? item.content : item.label || item.name); setIsEditing(true); }} className="p-1 hover:text-blue-400"><Edit2 size={10} /></button>
             <button onClick={() => onRemove(row, col)} className="p-1 hover:text-red-400"><X size={10} /></button>
          </div>

          {/* Content */}
          {item.type === 'text' ? (
            isEditing ? (
              <input 
                autoFocus 
                value={editValue} 
                onChange={(e) => setEditValue(e.target.value)} 
                onBlur={handleBlur}
                className="bg-slate-800 text-xs w-full text-center outline-none border border-blue-500 rounded"
              />
            ) : (
              <span className="text-sm font-bold text-slate-300">{item.content}</span>
            )
          ) : (
            <>
              {isEditing ? (
                 <input 
                    autoFocus 
                    value={editValue} 
                    onChange={(e) => setEditValue(e.target.value)} 
                    onBlur={handleBlur}
                    className="bg-slate-800 text-[10px] w-full text-center outline-none border border-blue-500 rounded mb-1"
                  />
              ) : (
                <span className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{item.label || item.name}</span>
              )}
              <span className={`text-lg font-bold ${value === '-' ? 'text-slate-600' : 'text-blue-400'}`}>
                {typeof value === 'number' ? value.toFixed(1) : value}%
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="text-slate-700 text-xs pointer-events-none">+</div>
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
  }, [isEditing, currentLayout, filters]);

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
            // Create default if none
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
    // Collect all stats from layout
    const statsToEval = currentLayout
        .filter(item => item.type === 'stat')
        .map(item => {
            // Reconstruct definition from saved item or find in availableStats
            // The item stores 'definition' when dropped
            return {
                id: item.id,
                name: item.name,
                ...item.definition
            };
        });

    if (statsToEval.length === 0) return;

    setLoadingValues(true);
    try {
        const payload = {
            stats: statsToEval,
            filters: filters // Pass current analysis filters
        };
        
        const res = await fetch('http://localhost:5050/stats/builder/evaluate-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        
        if (json.success) {
            // Map results by ID or Name
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
            // Update the profile in the list with the real ID from backend
            const savedId = json.id;
            const updatedProfiles = profiles.map(p => 
                p.id === profile.id ? { ...payload, id: savedId } : p
            );
            setProfiles(updatedProfiles);
            setActiveProfileId(savedId);
            setIsEditing(false);
        }
    } catch (err) {
        console.error(err);
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

  const handleExportProfile = () => {
      const profile = profiles.find(p => p.id === activeProfileId);
      if (!profile) return;
      
      const dataStr = JSON.stringify({ ...profile, layout: currentLayout }, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hud_profile_${profile.name}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleImportProfile = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
          try {
              const data = JSON.parse(ev.target.result);
              if (data.layout) {
                  // Save as new
                  const payload = {
                      name: data.name + ' (Imported)',
                      layout: data.layout,
                      isActive: true
                  };
                  const res = await fetch('http://localhost:5050/hud-profiles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  });
                  if (await res.json().success) {
                      loadProfiles();
                      alert('Imported successfully');
                  }
              }
          } catch (err) { alert('Invalid file'); }
      };
      reader.readAsText(file);
  };

  // Grid Logic
  const GRID_ROWS = 8;
  const GRID_COLS = 8;

  const handleDropItem = (row, col, item) => {
    // Check if cell occupied
    const existingIdx = currentLayout.findIndex(i => i.row === row && i.col === col);
    let newLayout = [...currentLayout];
    
    if (existingIdx >= 0) {
        newLayout.splice(existingIdx, 1); // Replace
    }

    newLayout.push({
        ...item,
        row,
        col
    });
    setCurrentLayout(newLayout);
  };

  const handleRemoveItem = (row, col) => {
      setCurrentLayout(currentLayout.filter(i => !(i.row === row && i.col === col)));
  };

  const handleUpdateItem = (row, col, updatedItem) => {
      setCurrentLayout(currentLayout.map(i => (i.row === row && i.col === col) ? updatedItem : i));
  };

  return (
    <DndProvider backend={HTML5Backend}>
        <div className="flex h-full gap-4">
            {/* Sidebar (Editor Only) */}
            {isEditing && (
                <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col overflow-hidden">
                    <h3 className="font-bold text-slate-400 mb-4 uppercase text-xs">Tools</h3>
                    <DraggableTextTool />
                    
                    <h3 className="font-bold text-slate-400 mt-4 mb-2 uppercase text-xs">Custom Stats</h3>
                    <div className="flex-1 overflow-y-auto">
                        {availableStats.map(s => (
                            <DraggableStat key={s.id} stat={s} />
                        ))}
                        {availableStats.length === 0 && <div className="text-xs text-slate-600">No stats created yet. Go to Stats Builder.</div>}
                    </div>
                </div>
            )}

            {/* Main Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/50">
                    <div className="flex items-center gap-4">
                        <Layout className="text-blue-500" size={20} />
                        <select 
                            value={activeProfileId || ''} 
                            onChange={(e) => {
                                const pid = e.target.value;
                                setActiveProfileId(pid);
                                const p = profiles.find(x => x.id === pid);
                                if (p) setCurrentLayout(p.layout || []);
                            }}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
                        >
                            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {isEditing && (
                            <input 
                                value={profiles.find(p => p.id === activeProfileId)?.name || ''}
                                onChange={(e) => {
                                    const newName = e.target.value;
                                    setProfiles(profiles.map(p => p.id === activeProfileId ? { ...p, name: newName } : p));
                                }}
                                className="bg-transparent border-b border-slate-700 text-sm px-2 focus:border-blue-500 outline-none w-48"
                                placeholder="Profile Name"
                            />
                        )}
                    </div>

                    <div className="flex gap-2">
                        {!isEditing ? (
                            <button onClick={() => setIsEditing(true)} className="btn btn-secondary text-xs flex items-center gap-2">
                                <Edit2 size={14} /> Edit HUD
                            </button>
                        ) : (
                            <>
                                <button onClick={handleSaveProfile} className="btn bg-green-600 hover:bg-green-500 text-white text-xs flex items-center gap-2">
                                    <Save size={14} /> Save
                                </button>
                                <button onClick={() => setIsEditing(false)} className="btn btn-secondary text-xs">
                                    Cancel
                                </button>
                            </>
                        )}
                        
                        <div className="h-6 w-px bg-slate-700 mx-2"></div>

                        <button onClick={handleNewProfile} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="New Profile">
                            <Plus size={16} />
                        </button>
                        <button onClick={handleExportProfile} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Export">
                            <Download size={16} />
                        </button>
                        <div className="relative">
                            <input type="file" accept=".json" onChange={handleImportProfile} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
                            <button className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Import">
                                <Upload size={16} />
                            </button>
                        </div>
                        <button onClick={handleDeleteProfile} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400" title="Delete">
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                {/* Grid Canvas */}
                <div className="flex-1 p-8 overflow-auto bg-slate-950 flex justify-center">
                    <div 
                        className="grid gap-1 bg-slate-900 border border-slate-800 p-1 shadow-2xl rounded-lg"
                        style={{
                            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(100px, 1fr))`,
                            gridTemplateRows: `repeat(${GRID_ROWS}, minmax(60px, 1fr))`,
                            width: 'fit-content'
                        }}
                    >
                        {Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, idx) => {
                            const row = Math.floor(idx / GRID_COLS);
                            const col = idx % GRID_COLS;
                            const item = currentLayout.find(i => i.row === row && i.col === col);
                            
                            // Get value if stat
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
                                    onDrop={handleDropItem}
                                    onRemove={handleRemoveItem}
                                    onUpdate={handleUpdateItem}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    </DndProvider>
  );
}

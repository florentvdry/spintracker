import React, { useState, useEffect } from 'react';
import { Play, X, MousePointer2, BoxSelect, FolderPlus, Plus, Trash2, Save, FileText, ChevronRight } from 'lucide-react';
import { ipcService } from '../../services/ipcService';

const PRESETS = [
  { label: 'Hero Raises', actor: 'Hero', action: 'Raise', color: 'bg-red-500/20 text-red-300 border-red-500/50' },
  { label: 'Hero Calls', actor: 'Hero', action: 'Call', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' },
  { label: 'Hero Folds', actor: 'Hero', action: 'Fold', color: 'bg-slate-500/20 text-slate-300 border-slate-500/50' },
  { label: 'Hero Bets', actor: 'Hero', action: 'Bet', color: 'bg-orange-500/20 text-orange-300 border-orange-500/50' },
  { label: 'Hero Checks', actor: 'Hero', action: 'Check', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' },
  { label: 'Hero All-In', actor: 'Hero', action: 'AllIn', color: 'bg-purple-500/20 text-purple-300 border-purple-500/50' },
  
  { label: 'Villain Raises', actor: 'Villain', action: 'Raise', color: 'bg-red-900/20 text-red-500 border-red-900/50' },
  { label: 'Villain Calls', actor: 'Villain', action: 'Call', color: 'bg-yellow-900/20 text-yellow-500 border-yellow-900/50' },
  { label: 'Villain Folds', actor: 'Villain', action: 'Fold', color: 'bg-slate-900/20 text-slate-500 border-slate-900/50' },
  { label: 'Villain Bets', actor: 'Villain', action: 'Bet', color: 'bg-orange-900/20 text-orange-500 border-orange-900/50' },
  { label: 'Villain Checks', actor: 'Villain', action: 'Check', color: 'bg-emerald-900/20 text-emerald-500 border-emerald-900/50' },
];

const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];

const StatsBuilder = () => {
  const [statsList, setStatsList] = useState([]);
  const [currentStatId, setCurrentStatId] = useState(null);
  
  const [stat, setStat] = useState({
    name: "New Stat",
    description: "",
    denominator: { operator: "AND", not: false, conditions: [], subGroups: [] }, 
    numerator: { operator: "AND", not: false, conditions: [], subGroups: [] }
  });

  const [selectedTarget, setSelectedTarget] = useState({ type: 'root', street: 'Flop' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState(null); // { path, street }

  // --- Init ---
  useEffect(() => {
    loadStatsList();
  }, []);

  const loadStatsList = async () => {
    try {
      const res = await fetch('http://localhost:5050/stats');
      const json = await res.json();
      if (json.success) {
        setStatsList(json.data);
      }
    } catch (err) {
      console.error("Failed to load stats", err);
    }
  };

  const handleSelectStat = async (id) => {
    try {
      const res = await fetch(`http://localhost:5050/stats/${id}`);
      const json = await res.json();
      if (json.success) {
        const loadedStat = json.data;
        const definition = typeof loadedStat.definition === 'string' ? JSON.parse(loadedStat.definition) : loadedStat.definition;
        
        setStat({
          name: loadedStat.name,
          description: loadedStat.description,
          ...definition
        });
        setCurrentStatId(loadedStat.id);
        setResult(null);
      }
    } catch (err) {
      console.error("Failed to load stat", err);
    }
  };

  const handleNewStat = () => {
    setStat({
      name: "New Stat",
      description: "",
      denominator: { operator: "AND", not: false, conditions: [], subGroups: [] }, 
      numerator: { operator: "AND", not: false, conditions: [], subGroups: [] }
    });
    setCurrentStatId(null);
    setResult(null);
  };

  const handleSaveStat = async () => {
    try {
      const payload = {
        id: currentStatId,
        name: stat.name,
        description: stat.description,
        definition: {
          denominator: stat.denominator,
          numerator: stat.numerator
        }
      };

      const res = await fetch('http://localhost:5050/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      
      if (json.success) {
        if (!currentStatId) setCurrentStatId(json.id);
        loadStatsList();
        alert('Stat saved!');
      } else {
        alert('Error saving: ' + json.error);
      }
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  };

  const handleDeleteStat = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this stat?')) return;
    
    try {
      await fetch(`http://localhost:5050/stats/${id}`, { method: 'DELETE' });
      loadStatsList();
      if (currentStatId === id) handleNewStat();
    } catch (err) {
      alert('Delete failed');
    }
  };

  // --- Logic Helpers ---

  const findGroup = (root, path) => {
    let current = root;
    for (const idx of path) {
      if (!current.subGroups || !current.subGroups[idx]) return null;
      current = current.subGroups[idx];
    }
    return current;
  };

  const updateGroup = (root, path, updateFn) => {
    if (path.length === 0) return updateFn(root);
    const newRoot = { ...root };
    let current = newRoot;
    const parentPath = path.slice(0, -1);
    const lastIdx = path[path.length - 1];

    for (const idx of parentPath) {
      current.subGroups = [...current.subGroups]; 
      current.subGroups[idx] = { ...current.subGroups[idx] }; 
      current = current.subGroups[idx];
    }

    current.subGroups = [...current.subGroups];
    current.subGroups[lastIdx] = updateFn({ ...current.subGroups[lastIdx] });
    return newRoot;
  };

  const addCondition = (actor, action, targetPath, targetStreet) => {
    const newCondition = {
      street: targetStreet,
      actor: actor,
      action: action,
      parameters: {}
    };

    if (targetPath.length === 0) {
      // Adding to root
      const newNumerator = { 
        ...stat.numerator, 
        conditions: [...stat.numerator.conditions, newCondition] 
      };
      setStat({ ...stat, numerator: newNumerator });
    } else {
      // Adding to group
      const newNumerator = updateGroup(stat.numerator, targetPath, (group) => ({
        ...group,
        conditions: [...group.conditions, newCondition]
      }));
      setStat({ ...stat, numerator: newNumerator });
    }
  };

  const addGroup = (street) => {
    const newGroup = {
      operator: 'AND',
      streetContext: street,
      conditions: [],
      subGroups: []
    };

    if (selectedTarget.type === 'root') {
      const newNumerator = {
        ...stat.numerator,
        subGroups: [...stat.numerator.subGroups, { ...newGroup, streetContext: selectedTarget.street }]
      };
      setStat({ ...stat, numerator: newNumerator });
    } else {
      const newNumerator = updateGroup(stat.numerator, selectedTarget.path, (group) => ({
        ...group,
        subGroups: [...group.subGroups, newGroup]
      }));
      setStat({ ...stat, numerator: newNumerator });
    }
  };

  const removeConditionAt = (path, index) => {
    if (path.length === 0) {
      const newConds = [...stat.numerator.conditions];
      newConds.splice(index, 1);
      setStat({ ...stat, numerator: { ...stat.numerator, conditions: newConds } });
    } else {
      const newNumerator = updateGroup(stat.numerator, path, (group) => {
        const newConds = [...group.conditions];
        newConds.splice(index, 1);
        return { ...group, conditions: newConds };
      });
      setStat({ ...stat, numerator: newNumerator });
    }
  };

  const removeGroupAt = (path) => {
    if (path.length === 0) return; 
    const parentPath = path.slice(0, -1);
    const index = path[path.length - 1];

    if (parentPath.length === 0) {
      const newSubGroups = [...stat.numerator.subGroups];
      newSubGroups.splice(index, 1);
      setStat({ ...stat, numerator: { ...stat.numerator, subGroups: newSubGroups } });
    } else {
      const newNumerator = updateGroup(stat.numerator, parentPath, (parent) => {
        const newSubGroups = [...parent.subGroups];
        newSubGroups.splice(index, 1);
        return { ...parent, subGroups: newSubGroups };
      });
      setStat({ ...stat, numerator: newNumerator });
    }
    setSelectedTarget({ type: 'root', street: 'Flop' });
  };

  const toggleOperator = (path) => {
    if (path.length === 0) {
      setStat({ 
        ...stat, 
        numerator: { ...stat.numerator, operator: stat.numerator.operator === 'AND' ? 'OR' : 'AND' } 
      });
    } else {
      const newNumerator = updateGroup(stat.numerator, path, (group) => ({
        ...group,
        operator: group.operator === 'AND' ? 'OR' : 'AND'
      }));
      setStat({ ...stat, numerator: newNumerator });
    }
  };

  const handleTest = async () => {
    setLoading(true);
    try {
      let response;
      const ipcResult = await ipcService.evaluateStat(stat);
      if (ipcResult.success) response = ipcResult;
      else if (ipcResult.message === 'IPC not available') {
        const res = await fetch('http://localhost:5050/stats/builder/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stat)
        });
        response = await res.json();
      } else throw new Error(ipcResult.message || 'IPC Error');

      if (response.success) setResult(response.data);
      else alert('Error: ' + response.error);
    } catch (error) {
      alert('Failed to evaluate stat: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  // --- DnD Handlers ---
  const handleDragStart = (e, preset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(preset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e, path, street) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    // Only update state if it changed to avoid flicker
    const key = `${JSON.stringify(path)}-${street}`;
    if (dragOverTarget?.key !== key) {
        setDragOverTarget({ path, street, key });
    }
  };

  const handleDragLeave = (e) => {
    // Ideally check if leaving to a child or parent, but simpler to just let DragOver handle setting
    // setDragOverTarget(null); // This causes flickering if not careful
  };

  const handleDrop = (e, path, street) => {
    e.preventDefault();
    setDragOverTarget(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.actor && data.action) {
        addCondition(data.actor, data.action, path, street);
      }
    } catch (err) {
      console.error('Drop failed', err);
    }
  };

  // --- Rendering ---

  const RenderGroup = ({ group, path, streetFilter }) => {
    const isRoot = path.length === 0;
    const isSelected = selectedTarget.type === 'group' && JSON.stringify(selectedTarget.path) === JSON.stringify(path);
    const isDragOver = dragOverTarget && JSON.stringify(dragOverTarget.path) === JSON.stringify(path) && dragOverTarget.street === streetFilter;

    // Filter items
    const displayConditions = isRoot 
      ? group.conditions.map((c, i) => ({ ...c, originalIndex: i, type: 'condition' })).filter(c => c.street === streetFilter)
      : group.conditions.map((c, i) => ({ ...c, originalIndex: i, type: 'condition' }));

    const displaySubGroups = isRoot
      ? group.subGroups.map((g, i) => ({ ...g, originalIndex: i, type: 'group' })).filter(g => g.streetContext === streetFilter)
      : group.subGroups.map((g, i) => ({ ...g, originalIndex: i, type: 'group' }));

    const allItems = [...displayConditions, ...displaySubGroups];

    return (
      <div 
        onClick={(e) => {
          e.stopPropagation();
          if (!isRoot) setSelectedTarget({ type: 'group', path });
        }}
        onDragOver={(e) => handleDragOver(e, path, streetFilter)}
        onDrop={(e) => handleDrop(e, path, streetFilter)}
        className={`
          flex flex-col rounded-lg transition-all min-h-[50px]
          ${!isRoot ? 'p-2 border-2 mt-2' : ''}
          ${isSelected ? 'border-blue-500 bg-blue-500/10' : !isRoot ? 'border-slate-700 bg-slate-800/50' : ''}
          ${isDragOver ? 'border-dashed border-green-500 bg-green-500/10' : ''}
        `}
      >
        {/* SubGroup Controls */}
        {!isRoot && (
          <div className="flex justify-end mb-1">
             <button onClick={(e) => { e.stopPropagation(); removeGroupAt(path); }} className="text-slate-500 hover:text-red-400">
               <X size={12} />
             </button>
          </div>
        )}

        {allItems.map((item, idx) => {
          const isLast = idx === allItems.length - 1;
          return (
            <React.Fragment key={`${item.type}-${item.originalIndex}`}>
              {/* Item Render */}
              {item.type === 'condition' ? (
                <div className={`flex items-center justify-between px-2 py-1.5 rounded border text-xs font-bold shadow-sm ${
                  PRESETS.find(p => p.actor === item.actor && p.action === item.action)?.color || 'bg-slate-700 text-slate-300'
                }`}>
                  <span>{item.actor} {item.action}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeConditionAt(path, item.originalIndex); }} className="hover:bg-black/20 p-1 rounded">
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <RenderGroup 
                  group={item} 
                  path={[...path, item.originalIndex]} 
                  streetFilter={streetFilter} 
                />
              )}

              {/* Logic Separator (AND/OR/AND NOT) */}
              {!isLast && (
                <div className="flex items-center justify-center my-1 relative group/sep cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleOperator(path); }}>
                  <div className={`h-px w-full absolute ${group.not ? 'bg-red-900/50' : 'bg-slate-700'}`}></div>
                  <span className={`
                    relative z-10 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors
                    ${group.operator === 'AND' && !group.not ? 'bg-slate-800 text-blue-400 border-slate-700 group-hover/sep:bg-blue-900' : ''}
                    ${group.operator === 'OR' ? 'bg-slate-800 text-purple-400 border-slate-700 group-hover/sep:bg-purple-900' : ''}
                    ${group.operator === 'AND' && group.not ? 'bg-red-950 text-red-400 border-red-800 group-hover/sep:bg-red-900' : ''}
                  `}>
                    {group.operator === 'AND' && group.not ? 'AND NOT' : group.operator}
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Empty State */}
        {!isRoot && allItems.length === 0 && (
          <div className="text-center py-2 text-xs text-slate-600 border border-dashed border-slate-700/50 rounded pointer-events-none">
            Drop actions here
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex bg-slate-900 text-slate-200 overflow-hidden">
      
      {/* 1. Stats Manager Sidebar */}
      <div className="w-64 border-r border-slate-800 flex flex-col bg-slate-950">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-300">My Stats</h2>
          <button onClick={handleNewStat} className="p-1 hover:bg-slate-800 rounded text-blue-400">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {statsList.map(s => (
            <div 
              key={s.id}
              onClick={() => handleSelectStat(s.id)}
              className={`p-3 rounded-lg cursor-pointer group flex items-center justify-between ${currentStatId === s.id ? 'bg-blue-600/20 text-blue-300' : 'hover:bg-slate-900 text-slate-400'}`}
            >
              <div className="flex items-center gap-2 truncate">
                <FileText size={14} />
                <span className="text-sm font-medium truncate">{s.name}</span>
              </div>
              <button onClick={(e) => handleDeleteStat(s.id, e)} className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Main Builder Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-16 border-b border-slate-800 bg-slate-900 px-6 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-blue-500">H2N</span> Style Builder
          </h1>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={stat.name}
              onChange={(e) => setStat({ ...stat, name: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none w-64"
              placeholder="Stat Name"
            />
            <button onClick={handleSaveStat} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded font-medium text-sm">
              <Save size={16} /> Save
            </button>
            <button onClick={handleTest} disabled={loading} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded font-medium text-sm disabled:opacity-50">
              {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Play size={16} />}
              Test
            </button>
          </div>
        </div>

        {/* Action Palette (Draggable) */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Actions (Drag & Drop)
          </h3>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={(e) => handleDragStart(e, preset)}
                className={`px-3 py-1.5 rounded text-xs font-bold border cursor-grab active:cursor-grabbing flex items-center gap-1.5 ${preset.color}`}
              >
                {preset.label}
              </div>
            ))}
          </div>
        </div>

        {/* Street Board */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-4 gap-4 min-h-full">
            {STREETS.map(street => {
              const isSelectedRoot = selectedTarget.type === 'root' && selectedTarget.street === street;
              return (
                <div 
                  key={street}
                  onClick={() => setSelectedTarget({ type: 'root', street })}
                  className={`
                    relative rounded-xl border-2 transition-all flex flex-col h-full
                    ${isSelectedRoot
                      ? 'border-blue-500/50 bg-slate-800/80 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}
                  `}
                >
                  <div className={`p-3 border-b border-dashed ${isSelectedRoot ? 'border-slate-700' : 'border-slate-800'} flex justify-between items-center`}>
                    <h3 className={`font-bold ${isSelectedRoot ? 'text-blue-400' : 'text-slate-500'}`}>{street}</h3>
                    {isSelectedRoot && (
                       <button onClick={(e) => { e.stopPropagation(); addGroup(street); }} className="text-slate-500 hover:text-white p-1 hover:bg-slate-700 rounded">
                         <FolderPlus size={14} />
                       </button>
                    )}
                  </div>

                  <div className="flex-1 p-3 flex flex-col gap-2">
                    <RenderGroup group={stat.numerator} path={[]} streetFilter={street} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Results Sidebar */}
      <div className="w-72 border-l border-slate-800 bg-slate-900 p-4 overflow-y-auto flex flex-col">
        <h3 className="font-bold text-white mb-4">Results</h3>
        {result ? (
          <div className="space-y-6">
            <div className="text-center p-6 bg-slate-800 rounded-xl border border-slate-700">
              <div className="text-5xl font-bold text-blue-400 mb-2">{result.value.toFixed(1)}%</div>
              <div className="text-xs text-slate-400 font-mono">{result.successes} / {result.opportunities}</div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-slate-400 text-xs uppercase tracking-wider">Matches</h4>
                <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-300">{result.matchingHandIds.length}</span>
              </div>
              <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-y-auto flex-1">
                {result.matchingHandIds.map(id => (
                  <div key={id} className="p-2 border-b border-slate-900 text-[10px] text-slate-400 font-mono hover:bg-slate-900 cursor-pointer truncate">
                    {id}
                  </div>
                ))}
                {result.matchingHandIds.length === 0 && <div className="p-4 text-center text-slate-600 text-xs">No matches found</div>}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-slate-600"><p className="text-sm">Run test to see results</p></div>
        )}
      </div>
    </div>
  );
};

export default StatsBuilder;

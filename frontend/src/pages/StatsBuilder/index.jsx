import React, { useState, useEffect } from 'react';
import { Play, X, Plus, Trash2, Save, FileText, ChevronRight, ChevronDown, Layers, GripVertical, Activity } from 'lucide-react';
import { ipcService } from '../../services/ipcService';
import { useNotificationStore } from '../../stores/notificationStore';
import { useReplayerStore } from '../../stores/replayerStore';
import Card from '../../components/ui/Card';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

const PRESETS = [
  { label: 'Hero Raises', actor: 'Hero', action: 'Raise', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  { label: 'Hero Calls', actor: 'Hero', action: 'Call', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  { label: 'Hero Folds', actor: 'Hero', action: 'Fold', color: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
  { label: 'Hero Bets', actor: 'Hero', action: 'Bet', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  { label: 'Hero Checks', actor: 'Hero', action: 'Check', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { label: 'Hero All-In', actor: 'Hero', action: 'AllIn', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  
  { label: 'Villain Raises', actor: 'Villain', action: 'Raise', color: 'bg-red-900/20 text-red-500 border-red-900/30' },
  { label: 'Villain Calls', actor: 'Villain', action: 'Call', color: 'bg-yellow-900/20 text-yellow-500 border-yellow-900/30' },
  { label: 'Villain Folds', actor: 'Villain', action: 'Fold', color: 'bg-gray-900/20 text-gray-500 border-gray-900/30' },
  { label: 'Villain Bets', actor: 'Villain', action: 'Bet', color: 'bg-orange-900/20 text-orange-500 border-orange-900/30' },
  { label: 'Villain Checks', actor: 'Villain', action: 'Check', color: 'bg-emerald-900/20 text-emerald-500 border-emerald-900/30' },
];

const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];

const StatsBuilder = () => {
  const [statsList, setStatsList] = useState([]);
  const [currentStatId, setCurrentStatId] = useState(null);
  const notify = useNotificationStore();
  const loadHand = useReplayerStore(state => state.loadHand);
  const { t } = useTranslation();
  
  const [activeMode, setActiveMode] = useState('numerator'); // 'numerator' | 'denominator'

  const [stat, setStat] = useState({
    name: "New Stat",
    description: "",
    denominator: { operator: "AND", not: false, conditions: [], subGroups: [] }, 
    numerator: { operator: "AND", not: false, conditions: [], subGroups: [] }
  });

  const [selectedTarget, setSelectedTarget] = useState({ type: 'root', street: 'Flop' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [collapsedStreets, setCollapsedStreets] = useState({});

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
        
        // Comprehensive mapping for both cases (Frontend uses lowercase internally)
        const denom = definition.denominator || definition.Denominator || { operator: "AND", not: false, conditions: [], subGroups: [] };
        const numer = definition.numerator || definition.Numerator || { operator: "AND", not: false, conditions: [], subGroups: [] };

        setStat({
          name: loadedStat.name,
          description: loadedStat.description,
          denominator: {
              operator: denom.operator || denom.Operator || "AND",
              not: denom.not || denom.Not || false,
              conditions: denom.conditions || denom.Conditions || [],
              subGroups: denom.subGroups || denom.SubGroups || []
          },
          numerator: {
              operator: numer.operator || numer.Operator || "AND",
              not: numer.not || numer.Not || false,
              conditions: numer.conditions || numer.Conditions || [],
              subGroups: numer.subGroups || numer.SubGroups || []
          }
        });
        setCurrentStatId(loadedStat.id);
        setResult(null);
      }
    } catch (err) {
      notify.error("Failed to load stat");
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
    setActiveMode('numerator');
  };

  const handleSaveStat = async () => {
    if (!stat.name || stat.name.trim() === "") {
      notify.warning("Please enter a stat name");
      return;
    }

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
        notify.success("Stat saved successfully");
      } else {
        notify.error("Error saving stat: " + json.error);
      }
    } catch (err) {
      notify.error("Save failed: " + err.message);
    }
  };

  const handleDeleteStat = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this stat?')) return;
    
    try {
      await fetch(`http://localhost:5050/stats/${id}`, { method: 'DELETE' });
      loadStatsList();
      if (currentStatId === id) handleNewStat();
      notify.success("Stat deleted");
    } catch (err) {
      notify.error('Delete failed');
    }
  };

  const updateGroup = (root, path, updateFn) => {
    if (path.length === 0) return updateFn(root);
    const newRoot = { ...root };
    let current = newRoot;
    const parentPath = path.slice(0, -1);
    const lastIdx = path[path.length - 1];

    for (const idx of parentPath) {
      current.subGroups = [...(current.subGroups || current.SubGroups || [])]; 
      current.subGroups[idx] = { ...current.subGroups[idx] }; 
      current = current.subGroups[idx];
    }

    current.subGroups = [...(current.subGroups || current.SubGroups || [])];
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

    const targetKey = activeMode; // 'numerator' or 'denominator'
    const targetGroup = stat[targetKey];

    if (targetPath.length === 0) {
      const updatedGroup = { 
        ...targetGroup, 
        conditions: [...(targetGroup.conditions || targetGroup.Conditions || []), newCondition] 
      };
      setStat({ ...stat, [targetKey]: updatedGroup });
    } else {
      const updatedRoot = updateGroup(targetGroup, targetPath, (group) => ({
        ...group,
        conditions: [...(group.conditions || group.Conditions || []), newCondition]
      }));
      setStat({ ...stat, [targetKey]: updatedRoot });
    }
  };

  const addGroup = (street) => {
    const newGroup = {
      operator: 'AND',
      streetContext: street,
      conditions: [],
      subGroups: []
    };

    const targetKey = activeMode;
    const targetGroup = stat[targetKey];

    if (selectedTarget.type === 'root') {
      const updatedRoot = {
        ...targetGroup,
        subGroups: [...(targetGroup.subGroups || targetGroup.SubGroups || []), { ...newGroup, streetContext: selectedTarget.street }]
      };
      setStat({ ...stat, [targetKey]: updatedRoot });
    } else {
      const updatedRoot = updateGroup(targetGroup, selectedTarget.path, (group) => ({
        ...group,
        subGroups: [...(group.subGroups || group.SubGroups || []), newGroup]
      }));
      setStat({ ...stat, [targetKey]: updatedRoot });
    }
  };

  const removeConditionAt = (path, index) => {
    const targetKey = activeMode;
    const targetGroup = stat[targetKey];

    if (path.length === 0) {
      const newConds = [...(targetGroup.conditions || targetGroup.Conditions || [])];
      newConds.splice(index, 1);
      setStat({ ...stat, [targetKey]: { ...targetGroup, conditions: newConds } });
    } else {
      const updatedRoot = updateGroup(targetGroup, path, (group) => {
        const newConds = [...(group.conditions || group.Conditions || [])];
        newConds.splice(index, 1);
        return { ...group, conditions: newConds };
      });
      setStat({ ...stat, [targetKey]: updatedRoot });
    }
  };

  const removeGroupAt = (path) => {
    if (path.length === 0) return; 
    const targetKey = activeMode;
    const targetGroup = stat[targetKey];

    const parentPath = path.slice(0, -1);
    const index = path[path.length - 1];

    if (parentPath.length === 0) {
      const newSubGroups = [...(targetGroup.subGroups || targetGroup.SubGroups || [])];
      newSubGroups.splice(index, 1);
      setStat({ ...stat, [targetKey]: { ...targetGroup, subGroups: newSubGroups } });
    } else {
      const updatedRoot = updateGroup(targetGroup, parentPath, (parent) => {
        const newSubGroups = [...(parent.subGroups || parent.SubGroups || [])];
        newSubGroups.splice(index, 1);
        return { ...parent, subGroups: newSubGroups };
      });
      setStat({ ...stat, [targetKey]: updatedRoot });
    }
    setSelectedTarget({ type: 'root', street: 'Flop' });
  };

  const toggleOperator = (path) => {
    const targetKey = activeMode;
    const targetGroup = stat[targetKey];

    if (path.length === 0) {
      setStat({ 
        ...stat, 
        [targetKey]: { ...targetGroup, operator: (targetGroup.operator || targetGroup.Operator) === 'AND' ? 'OR' : 'AND' } 
      });
    } else {
      const updatedRoot = updateGroup(targetGroup, path, (group) => ({
        ...group,
        operator: (group.operator || group.Operator) === 'AND' ? 'OR' : 'AND'
      }));
      setStat({ ...stat, [targetKey]: updatedRoot });
    }
  };

  const updateConditionParameter = (path, index, param, value) => {
    const targetKey = activeMode;
    const targetGroup = stat[targetKey];

    const updateFn = (group) => {
      const newConds = [...(group.conditions || group.Conditions || [])];
      const parameters = { ...(newConds[index].parameters || newConds[index].Parameters || {}) };
      
      if (value === '' || value === null || value === undefined) {
        delete parameters[param];
      } else {
        const numValue = Number(value);
        parameters[param] = isNaN(numValue) || value === '' ? value : numValue;
      }
      
      newConds[index] = {
        ...newConds[index],
        parameters
      };
      
      return { ...group, conditions: newConds };
    };

    if (path.length === 0) {
      setStat({ ...stat, [targetKey]: updateFn(targetGroup) });
    } else {
      const updatedRoot = updateGroup(targetGroup, path, updateFn);
      setStat({ ...stat, [targetKey]: updatedRoot });
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

      if (response.success) {
        setResult(response.data);
        notify.info(`Evaluation complete: ${response.data.value.toFixed(1)}%`);
      } else {
        notify.error('Evaluation failed: ' + response.error);
      }
    } catch (error) {
      notify.error('Failed to evaluate stat: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (e, preset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(preset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e, path, street) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    const key = `${JSON.stringify(path)}-${street}`;
    if (dragOverTarget?.key !== key) {
        setDragOverTarget({ path, street, key });
    }
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

  const toggleStreetCollapse = (street) => {
    setCollapsedStreets(prev => ({ ...prev, [street]: !prev[street] }));
  };

  const RenderGroup = ({ group, path, streetFilter }) => {
    if (!group) return null;
    
    const isRoot = path.length === 0;
    const isSelected = selectedTarget.type === 'group' && JSON.stringify(selectedTarget.path) === JSON.stringify(path);
    const isDragOver = dragOverTarget && JSON.stringify(dragOverTarget.path) === JSON.stringify(path) && dragOverTarget.street === streetFilter;

    // Support both lowercase and PascalCase keys for resilience
    const conditions = group.conditions || group.Conditions || [];
    const subGroups = group.subGroups || group.SubGroups || [];

    const displayConditions = isRoot 
      ? conditions.map((c, i) => ({ ...c, originalIndex: i, type: 'condition' })).filter(c => (c.street || c.Street) === streetFilter)
      : conditions.map((c, i) => ({ ...c, originalIndex: i, type: 'condition' }));

    const displaySubGroups = isRoot
      ? subGroups.map((g, i) => ({ ...g, originalIndex: i, type: 'group' })).filter(g => (g.streetContext || g.StreetContext) === streetFilter)
      : subGroups.map((g, i) => ({ ...g, originalIndex: i, type: 'group' }));

    const allItems = [...displayConditions, ...displaySubGroups];

    return (
      <div 
        onClick={(e) => {
          e.stopPropagation();
          if (!isRoot) setSelectedTarget({ type: 'group', path });
        }}
        onDragOver={(e) => handleDragOver(e, path, streetFilter)}
        onDrop={(e) => handleDrop(e, path, streetFilter)}
        className={clsx(
          "flex flex-col rounded-lg transition-all min-h-[40px] relative",
          !isRoot && "p-2 border mt-2 ml-4",
          isSelected ? "border-primary-500 bg-primary-500/5" : !isRoot ? "border-dark-100 bg-dark-400/50" : "",
          isDragOver && "border-dashed border-primary-400 bg-primary-500/10"
        )}
      >
        {!isRoot && (
          <div className="flex justify-between items-center mb-1 pb-1 border-b border-dark-100/30">
             <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tight">Nested Group</span>
             <button onClick={(e) => { e.stopPropagation(); removeGroupAt(path); }} className="text-gray-500 hover:text-red-400">
               <X size={10} />
             </button>
          </div>
        )}

        <div className="space-y-1">
          {allItems.map((item, idx) => {
            const isLast = idx === allItems.length - 1;
            return (
              <React.Fragment key={`${item.type}-${item.originalIndex}`}>
                {item.type === 'condition' ? (
                  <div className={clsx(
                    "flex flex-col rounded border shadow-sm transition-all hover:brightness-105",
                    PRESETS.find(p => p.actor === item.actor && p.action === item.action)?.color || 'bg-dark-300 text-gray-300 border-dark-100'
                  )}>
                    <div className="flex items-center justify-between px-2 py-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium">
                        <span className="opacity-70">{item.actor}</span>
                        <span className="font-bold">{item.action}</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removeConditionAt(path, item.originalIndex); }} className="hover:bg-black/10 p-0.5 rounded">
                        <X size={10} />
                      </button>
                    </div>
                    
                    {/* Parameters Section */}
                    <div className="px-2 pb-2 pt-1 border-t border-white/5 bg-black/10 flex flex-wrap gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[8px] uppercase opacity-50 font-bold">Pos</label>
                        <select 
                          value={(item.parameters || item.Parameters)?.Position || ''}
                          onChange={(e) => updateConditionParameter(path, item.originalIndex, 'Position', e.target.value)}
                          className="w-11 bg-dark-900/50 border border-white/10 rounded px-0.5 py-0.5 text-[9px] text-white outline-none focus:border-primary-500/50 appearance-none text-center"
                        >
                          <option value="">Any</option>
                          <option value="SB">SB</option>
                          <option value="BB">BB</option>
                          <option value="BTN">BTN</option>
                          <option value="CO">CO</option>
                          <option value="MP">MP</option>
                          <option value="UTG">UTG</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[8px] uppercase opacity-50 font-bold">Players</label>
                        <input 
                          type="number" 
                          min="2" 
                          max="10"
                          value={(item.parameters || item.Parameters)?.PlayerCount || ''}
                          onChange={(e) => updateConditionParameter(path, item.originalIndex, 'PlayerCount', e.target.value)}
                          className="w-10 bg-dark-900/50 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white outline-none focus:border-primary-500/50"
                          placeholder="All"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[8px] uppercase opacity-50 font-bold">Min BB</label>
                        <input 
                          type="number" 
                          min="0"
                          value={(item.parameters || item.Parameters)?.MinStackBB ?? ''}
                          onChange={(e) => updateConditionParameter(path, item.originalIndex, 'MinStackBB', e.target.value)}
                          className="w-12 bg-dark-900/50 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white outline-none focus:border-primary-500/50"
                          placeholder="0"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[8px] uppercase opacity-50 font-bold">Max BB</label>
                        <input 
                          type="number" 
                          min="0"
                          value={(item.parameters || item.Parameters)?.MaxStackBB ?? ''}
                          onChange={(e) => updateConditionParameter(path, item.originalIndex, 'MaxStackBB', e.target.value)}
                          className="w-12 bg-dark-900/50 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white outline-none focus:border-primary-500/50"
                          placeholder="∞"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <RenderGroup 
                    group={item} 
                    path={[...path, item.originalIndex]} 
                    streetFilter={streetFilter} 
                  />
                )}

                {!isLast && (
                  <div className="flex items-center justify-center my-1 relative cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleOperator(path); }}>
                    <div className="absolute left-0 right-0 h-px bg-dark-100/30"></div>
                    <span className={clsx(
                      "relative z-10 text-[9px] font-bold px-2 py-0.5 rounded border shadow-sm transition-all uppercase tracking-tighter",
                      group.operator === 'AND' && !group.not ? 'bg-dark-300 text-primary-400 border-dark-100' : 
                      group.operator === 'OR' ? 'bg-dark-300 text-purple-400 border-dark-100' :
                      'bg-red-900/20 text-red-400 border-red-500/30'
                    )}>
                      {group.operator === 'AND' && group.not ? 'AND NOT' : group.operator}
                    </span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {!isRoot && allItems.length === 0 && (
          <div className="text-center py-2 text-[10px] text-gray-500 border border-dashed border-dark-100 rounded opacity-50">
            Drop here
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-12 gap-6 items-start pb-10">
      
      {/* 1. Stats Manager Sidebar */}
      <div className="col-span-3 flex flex-col gap-4">
        <Card 
          title={t('stats_builder.library')} 
          subtitle={t('stats_builder.manage')}
          padding={false}
          className="min-h-[600px] h-[calc(100vh-140px)]"
          action={
            <button onClick={handleNewStat} className="p-1.5 hover:bg-primary-500/10 rounded-md text-primary-400 transition-colors">
              <Plus size={18} />
            </button>
          }
        >
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {statsList.map(s => (
              <div 
                key={s.id}
                onClick={() => handleSelectStat(s.id)}
                className={clsx(
                  "p-2.5 rounded-lg cursor-pointer group flex items-center justify-between transition-all border",
                  currentStatId === s.id ? "bg-primary-500/10 border-primary-500/30 text-primary-400" : "bg-dark-400/30 border-transparent hover:border-dark-100 text-gray-400"
                )}
              >
                <div className="flex items-center gap-2 truncate text-sm">
                  <FileText size={14} className={currentStatId === s.id ? "text-primary-400" : "text-gray-500"} />
                  <span className="truncate">{s.name}</span>
                </div>
                <button onClick={(e) => handleDeleteStat(s.id, e)} className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-all">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {statsList.length === 0 && (
              <div className="p-8 text-center text-xs text-gray-500 italic">{t('common.no_data')}</div>
            )}
          </div>
        </Card>
      </div>

      {/* 2. Main Builder Area */}
      <div className="col-span-6 flex flex-col gap-4">
        {/* Editor Config Card */}
        <Card className="p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block tracking-wider">{t('common.name', 'Name')}</label>
                <input 
                  type="text" 
                  value={stat.name}
                  onChange={(e) => setStat({ ...stat, name: e.target.value })}
                  className="input py-1.5 text-sm font-semibold"
                  placeholder="Ex: PFR (Preflop Raise)"
                />
              </div>
              <div className="flex gap-2 pt-5">
                <button onClick={handleSaveStat} className="btn-secondary flex items-center gap-2 text-xs py-1.5">
                  <Save size={14} /> {t('stats_builder.save')}
                </button>
                <button onClick={handleTest} disabled={loading} className="btn-primary flex items-center gap-2 text-xs py-1.5">
                  {loading ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-dark-500 border-t-transparent" /> : <Play size={14} />}
                  {t('stats_builder.test')}
                </button>
              </div>
            </div>

            {/* Mode Toggle - H2N STYLE */}
            <div className="flex bg-dark-400 p-1 rounded-xl border border-dark-100 self-start shadow-2xl mb-2">
                <button 
                    onClick={() => setActiveMode('denominator')}
                    className={clsx(
                        "px-8 py-3 rounded-lg text-xs font-black uppercase transition-all flex flex-col items-center gap-1 min-w-[180px]",
                        activeMode === 'denominator' 
                          ? "bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] ring-1 ring-white/20" 
                          : "text-gray-500 hover:text-gray-300 hover:bg-dark-200"
                    )}
                >
                    <Activity size={16} />
                    <span>{t('stats_builder.opportunity')}</span>
                    <span className="text-[8px] opacity-60 font-medium">{t('stats_builder.opportunity_desc')}</span>
                </button>
                <div className="w-px bg-dark-100 my-2 mx-1"></div>
                <button 
                    onClick={() => setActiveMode('numerator')}
                    className={clsx(
                        "px-8 py-3 rounded-lg text-xs font-black uppercase transition-all flex flex-col items-center gap-1 min-w-[180px]",
                        activeMode === 'numerator' 
                          ? "bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] ring-1 ring-white/20" 
                          : "text-gray-500 hover:text-gray-300 hover:bg-dark-200"
                    )}
                >
                    <Play size={16} />
                    <span>{t('stats_builder.success')}</span>
                    <span className="text-[8px] opacity-60 font-medium">{t('stats_builder.success_desc')}</span>
                </button>
            </div>
          </div>
        </Card>

        {/* Action Palette */}
        <Card className="p-3" padding={false}>
          <div className="px-3 py-2 border-b border-dark-100/30 flex items-center justify-between bg-dark-300/30">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <GripVertical size={12} className="text-primary-500" />
              {t('stats_builder.palette')}
            </h3>
            <span className="text-[9px] text-gray-500 italic uppercase">{t('stats_builder.drag_guide')}</span>
          </div>
          <div className="p-3 flex flex-wrap gap-1.5">
            {PRESETS.map((preset, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={(e) => handleDragStart(e, preset)}
                className={clsx(
                  "px-2 py-1 rounded text-[10px] font-bold border cursor-grab active:cursor-grabbing flex items-center gap-1 transition-all hover:scale-105",
                  preset.color
                )}
              >
                {preset.label}
              </div>
            ))}
          </div>
        </Card>

        {/* Timeline Area */}
        <div className="space-y-4">
          {STREETS.map((street, index) => {
            const isSelectedRoot = selectedTarget.type === 'root' && selectedTarget.street === street;
            const isCollapsed = collapsedStreets[street];
            
            return (
              <div key={street} className="relative group">
                <div 
                  onClick={() => setSelectedTarget({ type: 'root', street })}
                  className={clsx(
                    "rounded-xl border transition-all overflow-hidden",
                    isSelectedRoot ? "border-primary-500/50 bg-dark-400 shadow-lg ring-1 ring-primary-500/20" : "border-dark-100/50 bg-dark-400/50 hover:border-dark-100"
                  )}
                >
                  <div className="px-4 py-2 flex items-center justify-between border-b border-dark-100/30 bg-dark-300/50">
                    <div className="flex items-center gap-3">
                       <h3 className={clsx("text-sm font-bold tracking-tight", isSelectedRoot ? "text-primary-400" : "text-gray-400")}>{street}</h3>
                       {isSelectedRoot && <span className="badge-info text-[9px] uppercase tracking-tighter px-2">{t('common.selected', 'Selected')}</span>}
                    </div>
                    <div className="flex gap-1">
                      {isSelectedRoot && (
                          <button onClick={(e) => { e.stopPropagation(); addGroup(street); }} className="btn-icon p-1 hover:bg-dark-200" title="Add Group">
                              <Layers size={14} />
                          </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); toggleStreetCollapse(street); }} className="btn-icon p-1 hover:bg-dark-200">
                         {isCollapsed ? <ChevronDown size={14} /> : <ChevronRight size={14} className="rotate-[-90deg]" />}
                      </button>
                    </div>
                  </div>

                  {!isCollapsed && (
                      <div className="p-3 min-h-[60px] bg-dark-500/30">
                          <RenderGroup group={stat[activeMode]} path={[]} streetFilter={street} />
                      </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Results Sidebar */}
      <div className="col-span-3">
        <Card 
          title={t('stats_builder.results')} 
          subtitle={t('stats_builder.metrics')}
          padding={false}
          className="min-h-[600px] h-[calc(100vh-140px)]"
        >
          {result ? (
            <div className="p-4 space-y-6 animate-fade-in">
              <div className="text-center p-6 bg-dark-400/50 rounded-xl border border-dark-100/30 shadow-inner">
                <div className="text-5xl font-black text-white mb-1 tracking-tighter">
                  {result.value.toFixed(1)}<span className="text-xl text-primary-500 ml-0.5">%</span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono py-1 px-3 bg-dark-900 rounded-full border border-dark-100/20 inline-block">
                  {result.successes} <span className="opacity-30">/</span> {result.opportunities} <span className="opacity-50 font-sans ml-1">(S/O)</span>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <h4 className="font-bold text-gray-500 text-[10px] uppercase tracking-widest">{t('stats_builder.matching_hands')}</h4>
                  <span className="badge-info">{result.matchingHands?.length || 0}</span>
                </div>
                <div className="bg-dark-900/50 rounded-lg border border-dark-100/30 overflow-hidden">
                  <div className="overflow-y-auto max-h-[350px] divide-y divide-dark-100/10 custom-scrollbar">
                      {result.matchingHands?.map(hand => (
                      <div 
                        key={hand.id} 
                        onClick={() => loadHand(hand.id)}
                        className="px-3 py-2 text-[10px] text-gray-500 font-mono hover:bg-dark-400 hover:text-primary-400 cursor-pointer transition-colors flex items-center justify-between group"
                      >
                          <div className="flex items-center gap-2 truncate">
                            <Activity size={10} className="text-primary-500 opacity-50 group-hover:opacity-100" />
                            <span className="font-bold text-gray-300 group-hover:text-primary-400">#{hand.handId}</span>
                          </div>
                          <span className="text-[9px] opacity-40 group-hover:opacity-70">{hand.dateTime}</span>
                      </div>
                      ))}
                      {(!result.matchingHands || result.matchingHands.length === 0) && (
                        <div className="p-8 text-center text-gray-500 text-xs italic">{t('common.no_data')}</div>
                      )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-8 text-center h-full">
              <div className="w-12 h-12 bg-dark-400 rounded-full flex items-center justify-center mb-4 opacity-50 border border-dark-100 animate-pulse">
                  <Activity size={24} />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">{t('stats_builder.no_data')}</p>
              <p className="text-[10px] mt-2 opacity-60">{t('stats_builder.eval_guide')}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default StatsBuilder;

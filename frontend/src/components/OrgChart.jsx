import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Avatar from './Avatar';
import { GitBranch, ChevronDown, ChevronRight, Search, Loader2 } from 'lucide-react';

function OrgRow({ node, depth, focusId, expandedMap, onToggle, onNavigate, onFocus }) {
  const isFocus = node.id === focusId;
  const isExpanded = expandedMap[node.id]?.expanded;
  const children = expandedMap[node.id]?.children || [];
  const loading = expandedMap[node.id]?.loading;
  const hasChildren = node.child_count > 0;

  return (
    <>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all hover:bg-white/[0.04] group ${isFocus ? 'bg-blue-500/10 border border-blue-500/20' : ''}`}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={() => hasChildren && onToggle(node.id)}
          className={`w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors ${hasChildren ? 'text-zinc-500 hover:text-zinc-300 cursor-pointer' : 'text-transparent'}`}
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin text-zinc-500" />
          ) : hasChildren ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
          )}
        </button>

        {/* Person info — click navigates to profile */}
        <div
          onClick={() => onNavigate(node.id)}
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
          title={node.name !== node.display_name ? node.name : undefined}
        >
          <Avatar src={node.avatar} name={node.display_name} size="sm" />
          <div className="flex-1 min-w-0">
            <span className={`text-sm font-medium ${isFocus ? 'text-blue-400' : 'text-zinc-200'}`}>{node.display_name}</span>
            {node.role && <span className="text-xs text-zinc-600 ml-2 hidden sm:inline">{node.role}</span>}
          </div>
        </div>

        {/* Child count + focus button */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasChildren && (
            <span className="text-[10px] text-zinc-600">{node.child_count}</span>
          )}
          {!isFocus && (
            <button
              onClick={() => onFocus(node.id)}
              className="text-[10px] text-zinc-700 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all px-1"
            >
              focus
            </button>
          )}
        </div>
      </div>

      {/* Expanded children */}
      {isExpanded && children.map(child => (
        <OrgRow
          key={child.id}
          node={child}
          depth={depth + 1}
          focusId={focusId}
          expandedMap={expandedMap}
          onToggle={onToggle}
          onNavigate={onNavigate}
          onFocus={onFocus}
        />
      ))}
    </>
  );
}

export default function OrgChartPage() {
  const [data, setData] = useState(null);
  const [expandedMap, setExpandedMap] = useState({});  // id → { expanded: bool, children: [], loading: bool }
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setData(null);
    setExpandedMap({});
    api.getFocusedTree(focusId).then(d => {
      setData(d);
      // Build initial expanded map from the focused tree data
      const map = {};
      for (const node of d.nodes) {
        if (node.expanded || node.is_focus) {
          map[node.id] = {
            expanded: true,
            children: node.children || [],
            loading: false,
          };
        }
      }
      setExpandedMap(map);
    }).catch(console.error);
  }, [focusId]);

  const toggleExpand = useCallback(async (nodeId) => {
    setExpandedMap(prev => {
      const entry = prev[nodeId];
      if (entry?.expanded) {
        // Collapse
        return { ...prev, [nodeId]: { ...entry, expanded: false } };
      }
      if (entry?.children?.length > 0) {
        // Re-expand (already have children)
        return { ...prev, [nodeId]: { ...entry, expanded: true } };
      }
      // Need to fetch children
      return { ...prev, [nodeId]: { expanded: true, children: [], loading: true } };
    });

    // Check if we need to fetch
    const entry = expandedMap[nodeId];
    if (!entry?.children?.length) {
      const children = await api.getOrgChildren(nodeId);
      setExpandedMap(prev => ({
        ...prev,
        [nodeId]: { expanded: true, children, loading: false },
      }));
    }
  }, [expandedMap]);

  const handleSearch = (q) => {
    setSearchQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const r = await api.searchPeople(q, 8);
      setSearchResults(r);
    }, 200);
  };

  const focusOnPerson = (personId) => {
    setSearchParams({ focus: personId });
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  };

  // Close search on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!data) return <div className="p-8 text-zinc-600">Loading org chart...</div>;

  // Build the display: group nodes by depth, showing the tree structure
  const chain = data.chain || [];
  // Organize nodes into a renderable tree
  // Nodes come pre-organized by depth with siblings at each level
  const rootDepth = data.nodes.length > 0 ? data.nodes[0].depth : 0;

  // Group by depth for rendering
  const byDepth = {};
  for (const n of data.nodes) {
    if (!byDepth[n.depth]) byDepth[n.depth] = [];
    byDepth[n.depth].push(n);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
          <GitBranch size={20} className="text-blue-400" /> Org Chart
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600">{data.total} people</span>
          <div className="relative" ref={searchRef}>
            <button onClick={() => setShowSearch(!showSearch)}
              className="p-1.5 glass glass-hover rounded text-zinc-500 hover:text-zinc-300 transition-colors">
              <Search size={14} />
            </button>
            {showSearch && (
              <div className="absolute right-0 top-full mt-1 w-64 z-50">
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Find person..."
                  className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none"
                />
                {searchResults.length > 0 && (
                  <div className="mt-1 glass rounded-lg border border-white/10 max-h-48 overflow-y-auto shadow-xl">
                    {searchResults.map(p => (
                      <button key={p.id} onClick={() => focusOnPerson(p.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.04] transition-colors">
                        <Avatar src={p.avatar} name={p.display_name} size="xs" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-200 truncate">{p.display_name}</div>
                          {p.role && <div className="text-xs text-zinc-500 truncate">{p.role}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Breadcrumb chain */}
      {chain.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 mb-3 text-xs">
          {chain.map((id, i) => {
            const node = data.nodes.find(n => n.id === id);
            const name = node?.display_name || '...';
            const isLast = i === chain.length - 1;
            return (
              <span key={id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={10} className="text-zinc-700" />}
                <button
                  onClick={() => focusOnPerson(id)}
                  className={`hover:text-blue-300 transition-colors ${isLast ? 'text-blue-400 font-medium' : 'text-zinc-500'}`}
                >
                  {name}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {data.nodes.length === 0 ? (
        <div className="text-center text-zinc-700 py-12 text-sm">
          No people found. Set your identity in Settings and import an org chart.
        </div>
      ) : (
        <div className="glass rounded-lg py-1">
          {Object.keys(byDepth).sort((a, b) => a - b).map(depth => (
            byDepth[depth].map(node => (
              <OrgRow
                key={node.id}
                node={node}
                depth={parseInt(depth)}
                focusId={data.focus_id}
                expandedMap={expandedMap}
                onToggle={toggleExpand}
                onNavigate={(id) => navigate(`/people/${id}`)}
                onFocus={focusOnPerson}
              />
            ))
          ))}
        </div>
      )}
    </div>
  );
}

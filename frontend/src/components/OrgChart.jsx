import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Avatar from './Avatar';
import { GitBranch, ChevronDown, ChevronRight, Search, Loader2 } from 'lucide-react';

function OrgRow({ node, depth, focusId, onToggle, onNavigate, onFocus, loadingIds }) {
  const isFocus = node.id === focusId;
  const hasChildren = node.child_count > 0;
  const isExpanded = node.children !== null && node.children !== undefined;
  const isLoading = loadingIds.has(node.id);
  const children = node.children || [];

  return (
    <>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all hover:bg-white/[0.04] group ${isFocus ? 'bg-blue-500/10 border border-blue-500/20' : ''}`}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        <button
          onClick={() => hasChildren && onToggle(node.id)}
          className={`w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors ${hasChildren ? 'text-zinc-500 hover:text-zinc-300 cursor-pointer' : 'text-transparent'}`}
        >
          {isLoading ? (
            <Loader2 size={12} className="animate-spin text-zinc-500" />
          ) : hasChildren ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
          )}
        </button>

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

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasChildren && <span className="text-[10px] text-zinc-600">{node.child_count}</span>}
          {!isFocus && (
            <button onClick={() => onFocus(node.id)}
              className="text-[10px] text-zinc-700 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all px-1">
              focus
            </button>
          )}
        </div>
      </div>

      {isExpanded && children.map(child => (
        <OrgRow key={child.id} node={child} depth={depth + 1} focusId={focusId}
          onToggle={onToggle} onNavigate={onNavigate} onFocus={onFocus} loadingIds={loadingIds} />
      ))}
    </>
  );
}

export default function OrgChartPage() {
  const [tree, setTree] = useState(null);
  const [focusData, setFocusData] = useState({ focus_id: null, chain: [], total: 0 });
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setTree(null);
    api.getFocusedTree(focusId).then(d => {
      setTree(d.tree);
      setFocusData({ focus_id: d.focus_id, chain: d.chain, total: d.total });
    }).catch(console.error);
  }, [focusId]);

  const toggleNode = useCallback(async (nodeId) => {
    // Helper to find and update a node in the tree
    const updateNode = (nodes, id, updater) => {
      return nodes.map(n => {
        if (n.id === id) return updater(n);
        if (n.children) return { ...n, children: updateNode(n.children, id, updater) };
        return n;
      });
    };

    // Find the node
    const findNode = (nodes, id) => {
      for (const n of nodes) {
        if (n.id === id) return n;
        if (n.children) {
          const found = findNode(n.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNode(tree, nodeId);
    if (!node) return;

    if (node.children !== null && node.children !== undefined) {
      // Already expanded — collapse by setting children to null
      setTree(prev => updateNode(prev, nodeId, n => ({ ...n, children: null })));
    } else {
      // Need to fetch children
      setLoadingIds(prev => new Set([...prev, nodeId]));
      const children = await api.getOrgChildren(nodeId).catch(() => []);
      setLoadingIds(prev => { const next = new Set(prev); next.delete(nodeId); return next; });
      setTree(prev => updateNode(prev, nodeId, n => ({ ...n, children })));
    }
  }, [tree]);

  const handleSearch = (q) => {
    setSearchQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchResults(await api.searchPeople(q, 8).catch(() => []));
    }, 200);
  };

  const focusOnPerson = (personId) => {
    setSearchParams({ focus: personId });
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  };

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!tree) return <div className="p-8 text-zinc-600">Loading org chart...</div>;

  const { focus_id, chain, total } = focusData;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
          <GitBranch size={20} className="text-blue-400" /> Org Chart
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600">{total} people</span>
          <div className="relative z-50" ref={searchRef}>
            <button onClick={() => setShowSearch(!showSearch)}
              className="p-1.5 glass glass-hover rounded text-zinc-500 hover:text-zinc-300 transition-colors">
              <Search size={14} />
            </button>
            {showSearch && (
              <div className="absolute right-0 top-full mt-1 w-64">
                <input autoFocus value={searchQuery} onChange={e => handleSearch(e.target.value)}
                  placeholder="Find person..." className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
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

      {chain.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 mb-3 text-xs">
          {chain.map((id, i) => {
            const findName = (nodes) => {
              for (const n of nodes) {
                if (n.id === id) return n.display_name;
                if (n.children) { const f = findName(n.children); if (f) return f; }
              }
              return null;
            };
            const name = findName(tree) || '...';
            const isLast = i === chain.length - 1;
            return (
              <span key={id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={10} className="text-zinc-700" />}
                <button onClick={() => focusOnPerson(id)}
                  className={`hover:text-blue-300 transition-colors ${isLast ? 'text-blue-400 font-medium' : 'text-zinc-500'}`}>
                  {name}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {tree.length === 0 ? (
        <div className="text-center text-zinc-700 py-12 text-sm">
          No people found. Set your identity in Settings and import an org chart.
        </div>
      ) : (
        <div className="glass rounded-lg py-1">
          {tree.map(node => (
            <OrgRow key={node.id} node={node} depth={0} focusId={focus_id}
              onToggle={toggleNode} onNavigate={(id) => navigate(`/people/${id}`)}
              onFocus={focusOnPerson} loadingIds={loadingIds} />
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Avatar from './Avatar';
import { GitBranch, ChevronDown, ChevronUp, Search, ChevronRight } from 'lucide-react';

function OrgNode({ node, navigate, expandedSet, toggleExpand, focusId }) {
  const isExpanded = expandedSet.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const isFocus = node.id === focusId;
  const childrenRef = useRef(null);
  const [hLineStyle, setHLineStyle] = useState(null);

  useEffect(() => {
    if (!isExpanded || !hasChildren || node.children.length < 2) {
      setHLineStyle(null);
      return;
    }
    const timer = setTimeout(() => {
      const container = childrenRef.current;
      if (!container) return;
      const vLines = container.querySelectorAll(':scope > div > .org-vline');
      if (vLines.length < 2) return;
      const first = vLines[0];
      const last = vLines[vLines.length - 1];
      const containerRect = container.getBoundingClientRect();
      const firstRect = first.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      setHLineStyle({
        left: firstRect.left - containerRect.left + firstRect.width / 2,
        width: (lastRect.left + lastRect.width / 2) - (firstRect.left + firstRect.width / 2),
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isExpanded, hasChildren, node.children?.length]);

  return (
    <div className="flex flex-col items-center">
      <div
        onClick={() => navigate(`/people/${node.id}`)}
        title={node.name !== node.display_name ? node.name : undefined}
        className={`glass glass-hover rounded-lg px-3 py-2 cursor-pointer transition-all min-w-[120px] max-w-[160px] text-center relative ${isFocus ? 'ring-2 ring-blue-500/50' : ''}`}
      >
        <div className="flex flex-col items-center gap-1">
          <Avatar src={node.avatar} name={node.display_name} size="sm" />
          <div className="text-xs font-medium text-zinc-200 leading-tight">{node.display_name}</div>
          {node.role && <div className="text-[10px] text-zinc-500 leading-tight truncate w-full">{node.role}</div>}
        </div>
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
            className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full glass border border-white/10 flex items-center justify-center text-zinc-500 hover:text-zinc-300 z-10 transition-colors"
          >
            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {!isExpanded && <span className="absolute -top-1 -right-1 text-[8px] text-zinc-500 bg-zinc-900 rounded-full px-0.5">{node.children.length}</span>}
          </button>
        )}
      </div>

      {hasChildren && isExpanded && (
        <>
          <div className="w-px h-5 bg-white/[0.1]" />
          <div ref={childrenRef} className="relative flex gap-3 items-start">
            {hLineStyle && (
              <div className="absolute top-0 h-px bg-white/[0.1]"
                style={{ left: hLineStyle.left, width: hLineStyle.width }} />
            )}
            {node.children.map(child => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="org-vline w-px h-4 bg-white/[0.1]" />
                <OrgNode node={child} navigate={navigate} expandedSet={expandedSet} toggleExpand={toggleExpand} focusId={focusId} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const [data, setData] = useState(null);
  const [expandedSet, setExpandedSet] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.getOrgTree(focusId).then(d => {
      setData(d);
      // Set initial expansion from server hints
      if (d.expanded_ids) {
        setExpandedSet(new Set(d.expanded_ids));
      }
    }).catch(console.error);
  }, [focusId]);

  const toggleExpand = (id) => {
    setExpandedSet(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  if (!data) return <div className="p-8 text-zinc-600">Loading org chart...</div>;

  const chain = data.focus_chain || [];

  return (
    <div className="px-4 py-4">
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
        <div className="flex flex-wrap items-center gap-1 mb-4 text-xs">
          {[...chain].reverse().map((id, i) => {
            // Find node in tree data
            const findNode = (nodes) => {
              for (const n of nodes) {
                if (n.id === id) return n;
                const found = findNode(n.children || []);
                if (found) return found;
              }
              return null;
            };
            const node = findNode(data.roots);
            const name = node?.display_name || id;
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

      {data.roots.length === 0 && (
        <div className="text-center text-zinc-700 py-12 text-sm">
          No people with reporting relationships. Add people and set their reporting managers.
        </div>
      )}

      <div className="overflow-x-auto pb-8">
        <div className="flex gap-8 items-start justify-center min-w-min">
          {data.roots.map(root => (
            <OrgNode key={root.id} node={root} navigate={navigate} expandedSet={expandedSet} toggleExpand={toggleExpand} focusId={data.focus_id} />
          ))}
        </div>
      </div>
    </div>
  );
}

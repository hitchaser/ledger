import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Avatar from './Avatar';
import { GitBranch, ChevronDown, ChevronRight, Users } from 'lucide-react';

function OrgNode({ node, depth = 0, navigate }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  const LEVEL_COLORS = {
    director: 'border-l-violet-500',
    manager: 'border-l-blue-500',
    employee: 'border-l-sky-500',
    peer: 'border-l-slate-500',
    other: 'border-l-zinc-600',
  };

  return (
    <div className={depth > 0 ? 'ml-6' : ''}>
      <div className={`flex items-center gap-2 glass glass-hover rounded-lg px-3 py-2 mb-1 border-l-2 ${LEVEL_COLORS[node.reporting_level] || LEVEL_COLORS.other} cursor-pointer transition-all`}>
        {hasChildren && (
          <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="text-zinc-600 hover:text-zinc-300 flex-shrink-0">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        {!hasChildren && <div className="w-[14px]" />}
        <div className="flex items-center gap-2.5 flex-1 min-w-0" onClick={() => navigate(`/people/${node.id}`)}>
          <Avatar src={node.avatar} name={node.display_name} size="sm" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-zinc-200">{node.display_name}</span>
            {node.name !== node.display_name && <span className="text-xs text-zinc-600 ml-1.5">({node.name})</span>}
          </div>
          {node.role && <span className="text-xs text-zinc-500 flex-shrink-0">{node.role}</span>}
          <span className={`badge text-xs ${
            node.reporting_level === 'director' ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20' :
            node.reporting_level === 'manager' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' :
            node.reporting_level === 'employee' ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20' :
            'bg-zinc-500/10 text-zinc-500 border border-zinc-500/15'
          }`}>{node.reporting_level}</span>
          {hasChildren && <span className="text-xs text-zinc-700">{node.children.length}</span>}
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="relative">
          <div className="absolute left-[19px] top-0 bottom-2 w-px bg-white/[0.06]" />
          {node.children.map(child => (
            <OrgNode key={child.id} node={child} depth={depth + 1} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { api.getOrgTree().then(setData).catch(console.error); }, []);

  if (!data) return <div className="p-8 text-zinc-600">Loading org chart...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
          <GitBranch size={20} className="text-blue-400" /> Org Chart
        </h2>
        <span className="text-xs text-zinc-600">{data.total} people</span>
      </div>

      {data.roots.length === 0 && (
        <div className="text-center text-zinc-700 py-12 text-sm">
          No people with reporting relationships. Add people and set their reporting managers.
        </div>
      )}

      <div className="flex flex-col">
        {data.roots.map(root => (
          <OrgNode key={root.id} node={root} depth={0} navigate={navigate} />
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Avatar from './Avatar';
import { GitBranch, ChevronDown, ChevronUp } from 'lucide-react';

function OrgNode({ node, navigate, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Person box */}
      <div
        onClick={() => navigate(`/people/${node.id}`)}
        className="glass glass-hover rounded-lg px-3 py-2 cursor-pointer transition-all min-w-[120px] max-w-[160px] text-center relative"
      >
        <div className="flex flex-col items-center gap-1">
          <Avatar src={node.avatar} name={node.display_name} size="sm" />
          <div className="text-xs font-medium text-zinc-200 leading-tight">{node.display_name}</div>
          {node.role && <div className="text-[10px] text-zinc-500 leading-tight truncate w-full">{node.role}</div>}
        </div>
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-500 hover:text-zinc-300 z-10 transition-colors"
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        )}
      </div>

      {/* Connector line down */}
      {hasChildren && expanded && (
        <>
          <div className="w-px h-5 bg-white/[0.1]" />

          {/* Children with horizontal connector */}
          <div className="relative flex gap-2 items-start">
            {/* Horizontal line spanning from first child center to last child center */}
            {node.children.length > 1 && (
              <div className="absolute top-0 h-px bg-white/[0.1]"
                style={{ left: `calc(50% / ${node.children.length})`, right: `calc(50% / ${node.children.length})` }} />
            )}
            {node.children.map(child => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="w-px h-4 bg-white/[0.1]" />
                <OrgNode node={child} navigate={navigate} depth={depth + 1} />
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
  const navigate = useNavigate();

  useEffect(() => { api.getOrgTree().then(setData).catch(console.error); }, []);

  if (!data) return <div className="p-8 text-zinc-600">Loading org chart...</div>;

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-6">
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

      <div className="overflow-x-auto pb-8">
        <div className="flex gap-8 items-start justify-center min-w-min">
          {data.roots.map(root => (
            <OrgNode key={root.id} node={root} navigate={navigate} depth={0} />
          ))}
        </div>
      </div>
    </div>
  );
}

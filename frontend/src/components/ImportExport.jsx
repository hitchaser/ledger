import { useState, useRef } from 'react';
import { api } from '../api/client';
import { Upload, Download, Database, FileSpreadsheet, Check, AlertTriangle, X, GitBranch } from 'lucide-react';

const EXPORT_COLUMNS = [
  { key: 'display_name', label: 'Display Name', default: true },
  { key: 'name', label: 'Full Name', default: true },
  { key: 'role', label: 'Title', default: true },
  { key: 'reporting_level', label: 'Level', default: true },
  { key: 'manager', label: 'Reporting Manager', default: true },
  { key: 'location', label: 'Location', default: true },
  { key: 'address', label: 'Address', default: true },
  { key: 'email', label: 'Email', default: true },
  { key: 'spouse', label: 'Spouse', default: false },
  { key: 'birthday', label: 'Birthday', default: false },
  { key: 'children', label: 'Children', default: false },
  { key: 'hobbies', label: 'Hobbies', default: false },
];

export default function ImportExport() {
  const [importFile, setImportFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [exportCols, setExportCols] = useState(EXPORT_COLUMNS.filter(c => c.default).map(c => c.key));
  const [exportFormat, setExportFormat] = useState('csv');
  const fileRef = useRef(null);

  // Org import state
  const [orgFile, setOrgFile] = useState(null);
  const [orgPreview, setOrgPreview] = useState(null);
  const [orgImporting, setOrgImporting] = useState(false);
  const [orgResult, setOrgResult] = useState(null);
  const orgFileRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportResult(null);
    try {
      const data = await api.previewImport(file);
      setPreview(data);
    } catch (err) {
      alert('Failed to parse file: ' + err.message);
      setImportFile(null);
    }
  };

  const handleCommit = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const result = await api.commitImport(importFile);
      setImportResult(result);
      setPreview(null);
      setImportFile(null);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    setImporting(false);
  };

  const handleCancel = () => {
    setImportFile(null);
    setPreview(null);
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const toggleExportCol = (key) => {
    setExportCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const downloadTeamExport = () => {
    window.open(api.exportTeam(exportCols.join(','), exportFormat), '_blank');
  };

  const downloadBackup = () => {
    window.open(api.exportBackup(), '_blank');
  };

  const handleOrgFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOrgFile(file);
    setOrgResult(null);
    try {
      const data = await api.previewOrgImport(file);
      setOrgPreview(data);
    } catch (err) {
      alert('Failed to parse org file: ' + err.message);
      setOrgFile(null);
    }
  };

  const handleOrgCommit = async () => {
    if (!orgFile) return;
    setOrgImporting(true);
    try {
      const result = await api.commitOrgImport(orgFile);
      setOrgResult(result);
      setOrgPreview(null);
      setOrgFile(null);
    } catch (err) {
      alert('Org import failed: ' + err.message);
    }
    setOrgImporting(false);
  };

  const handleOrgCancel = () => {
    setOrgFile(null);
    setOrgPreview(null);
    setOrgResult(null);
    if (orgFileRef.current) orgFileRef.current.value = '';
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <h2 className="text-lg font-semibold text-zinc-200 mb-4">Import / Export</h2>

      {/* Org Chart Import */}
      <div className="glass rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
          <GitBranch size={16} className="text-violet-400" /> Import Org Chart (XLSX)
        </h3>
        <p className="text-xs text-zinc-500 mb-3">
          Upload your org chart export (XLSX). Expected columns: <strong>Unique Identifier</strong>, <strong>Name</strong>, <strong>Reports To</strong>, Line Detail 1 (role), Line Detail 2 (location), Organization Name.
          Matches by unique ID — creates new people, updates existing, archives departed. <span className="text-zinc-400">Never overwrites</span>: display names, personal profile data, avatars.
        </p>

        {!orgPreview && !orgResult && (
          <div>
            <input ref={orgFileRef} type="file" accept=".xlsx" onChange={handleOrgFileSelect} className="hidden" />
            <button onClick={() => orgFileRef.current?.click()}
              className="flex items-center gap-2 glass glass-hover rounded-lg px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition-all">
              <FileSpreadsheet size={16} /> Choose XLSX File
            </button>
          </div>
        )}

        {orgPreview && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="badge bg-blue-500/15 text-blue-400 border border-blue-500/20">{orgPreview.creates.length} new</span>
              <span className="badge bg-sky-500/15 text-sky-400 border border-sky-500/20">{orgPreview.updates.length} updates</span>
              <span className="badge bg-amber-500/15 text-amber-400 border border-amber-500/20">{orgPreview.archives.length} departures</span>
              <span className="text-xs text-zinc-600">{orgPreview.unchanged_count} unchanged &middot; {orgPreview.total_rows} total</span>
            </div>

            {orgPreview.creates.length > 0 && (
              <div className="mb-2">
                <span className="text-xs text-blue-400 font-medium">New People:</span>
                <div className="max-h-32 overflow-y-auto mt-1">
                  {orgPreview.creates.slice(0, 20).map((p, i) => (
                    <div key={i} className="text-xs text-zinc-400 py-0.5">{p.name} — {p.role || 'No role'} {p.is_leader ? '(leader)' : ''}</div>
                  ))}
                  {orgPreview.creates.length > 20 && <div className="text-xs text-zinc-600">...and {orgPreview.creates.length - 20} more</div>}
                </div>
              </div>
            )}

            {orgPreview.updates.length > 0 && (
              <div className="mb-2">
                <span className="text-xs text-sky-400 font-medium">Updates:</span>
                <div className="max-h-32 overflow-y-auto mt-1">
                  {orgPreview.updates.slice(0, 20).map((p, i) => (
                    <div key={i} className="text-xs text-zinc-400 py-0.5">
                      {p.name}: {Object.entries(p.changes).map(([k, v]) => `${k}: "${v.from}" → "${v.to}"`).join(', ')}
                    </div>
                  ))}
                  {orgPreview.updates.length > 20 && <div className="text-xs text-zinc-600">...and {orgPreview.updates.length - 20} more</div>}
                </div>
              </div>
            )}

            {orgPreview.archives.length > 0 && (
              <div className="mb-2">
                <span className="text-xs text-amber-400 font-medium">Departures (will be archived):</span>
                <div className="max-h-24 overflow-y-auto mt-1">
                  {orgPreview.archives.map((p, i) => (
                    <div key={i} className="text-xs text-zinc-400 py-0.5">{p.display_name} ({p.name})</div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button onClick={handleOrgCommit} disabled={orgImporting}
                className="flex items-center gap-1.5 bg-violet-600/80 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-lg border border-violet-500/20 transition-all disabled:opacity-40">
                <Check size={14} /> {orgImporting ? 'Importing...' : 'Confirm Import'}
              </button>
              <button onClick={handleOrgCancel} className="text-xs text-zinc-600 hover:text-zinc-400 px-3 py-2">Cancel</button>
            </div>
          </div>
        )}

        {orgResult && (
          <div className="p-3 rounded bg-violet-500/10 border border-violet-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Check size={14} className="text-violet-400" />
              <span className="text-sm text-violet-400 font-medium">Org import complete</span>
            </div>
            <p className="text-xs text-zinc-400">
              {orgResult.created} created, {orgResult.updated} updated, {orgResult.archived} archived
              {orgResult.errors?.length > 0 && `, ${orgResult.errors.length} warnings`}
            </p>
            {orgResult.errors?.map((e, i) => (
              <p key={i} className="text-xs text-amber-400 mt-1">{e}</p>
            ))}
            <button onClick={handleOrgCancel} className="text-xs text-zinc-500 hover:text-zinc-300 mt-2">Import another</button>
          </div>
        )}
      </div>

      {/* Import Section */}
      <div className="glass rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
          <Upload size={16} className="text-blue-400" /> Import People
        </h3>
        <p className="text-xs text-zinc-500 mb-3">
          Upload a CSV or Excel file. Required: <strong>Display Name</strong> (unique key). Optional: Full Name, Title, Director/Manager/Employee, Reporting Manager, Location, Address, Email. Existing people are updated, new ones created.
        </p>

        {!preview && !importResult && (
          <div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={handleFileSelect}
              className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 glass glass-hover rounded-lg px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition-all">
              <FileSpreadsheet size={16} /> Choose File (.csv or .xlsx)
            </button>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="badge bg-blue-500/15 text-blue-400 border border-blue-500/20">{preview.creates} new</span>
              <span className="badge bg-sky-500/15 text-sky-400 border border-sky-500/20">{preview.updates} updates</span>
              {preview.errors.length > 0 && (
                <span className="badge bg-rose-500/15 text-rose-400 border border-rose-500/20">{preview.errors.length} errors</span>
              )}
              <span className="text-xs text-zinc-600">{preview.total} total rows</span>
            </div>

            {preview.errors.length > 0 && (
              <div className="mb-3 p-2 rounded bg-rose-500/10 border border-rose-500/20">
                {preview.errors.map((e, i) => (
                  <div key={i} className="text-xs text-rose-400 flex items-center gap-1">
                    <AlertTriangle size={10} /> Row {e.row}: {e.error}
                  </div>
                ))}
              </div>
            )}

            <div className="max-h-60 overflow-y-auto mb-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-white/[0.06]">
                    <th className="text-left py-1 px-2">Action</th>
                    <th className="text-left py-1 px-2">Display Name</th>
                    <th className="text-left py-1 px-2">Full Name</th>
                    <th className="text-left py-1 px-2">Title</th>
                    <th className="text-left py-1 px-2">Level</th>
                    <th className="text-left py-1 px-2">Manager</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((p, i) => (
                    <tr key={i} className="border-b border-white/[0.03] text-zinc-400">
                      <td className="py-1 px-2">
                        <span className={`badge ${p.action === 'create' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : 'bg-sky-500/15 text-sky-400 border border-sky-500/20'}`}>
                          {p.action}
                        </span>
                      </td>
                      <td className="py-1 px-2 text-zinc-300">{p.display_name}</td>
                      <td className="py-1 px-2">{p.full_name}</td>
                      <td className="py-1 px-2">{p.role}</td>
                      <td className="py-1 px-2">{p.reporting_level}</td>
                      <td className="py-1 px-2">{p.reporting_manager}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <button onClick={handleCommit} disabled={importing}
                className="flex items-center gap-1.5 bg-blue-600/80 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg border border-blue-500/20 transition-all disabled:opacity-40">
                <Check size={14} /> {importing ? 'Importing...' : 'Confirm Import'}
              </button>
              <button onClick={handleCancel} className="text-xs text-zinc-600 hover:text-zinc-400 px-3 py-2">Cancel</button>
            </div>
          </div>
        )}

        {/* Import Result */}
        {importResult && (
          <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Check size={14} className="text-blue-400" />
              <span className="text-sm text-blue-400 font-medium">Import complete</span>
            </div>
            <p className="text-xs text-zinc-400">
              {importResult.created} created, {importResult.updated} updated
              {importResult.errors?.length > 0 && `, ${importResult.errors.length} warnings`}
            </p>
            {importResult.errors?.map((e, i) => (
              <p key={i} className="text-xs text-amber-400 mt-1">{e}</p>
            ))}
            <button onClick={handleCancel} className="text-xs text-zinc-500 hover:text-zinc-300 mt-2">Import another</button>
          </div>
        )}
      </div>

      {/* Export Team Directory */}
      <div className="glass rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
          <Download size={16} className="text-sky-400" /> Export Team Directory
        </h3>
        <p className="text-xs text-zinc-500 mb-3">Choose columns to include in the export.</p>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {EXPORT_COLUMNS.map(col => (
            <button key={col.key} onClick={() => toggleExportCol(col.key)}
              className={`badge cursor-pointer transition-all ${
                exportCols.includes(col.key)
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'glass text-zinc-500 hover:text-zinc-300'
              }`}>
              {col.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {['csv', 'xlsx'].map(f => (
              <button key={f} onClick={() => setExportFormat(f)}
                className={`px-2 py-1 rounded text-xs transition-all ${
                  exportFormat === f
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    : 'glass text-zinc-500 hover:text-zinc-300'
                }`}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={downloadTeamExport} disabled={exportCols.length === 0}
            className="flex items-center gap-1.5 bg-sky-600/80 hover:bg-sky-500 text-white text-sm px-4 py-2 rounded-lg border border-sky-500/20 transition-all disabled:opacity-40">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Full Backup */}
      <div className="glass rounded-lg p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
          <Database size={16} className="text-violet-400" /> Full Backup
        </h3>
        <p className="text-xs text-zinc-500 mb-3">
          Download a complete JSON backup of all Ledger data — people, projects, items, notes, meetings, settings. Use this to restore if needed.
        </p>
        <button onClick={downloadBackup}
          className="flex items-center gap-1.5 bg-violet-600/80 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-lg border border-violet-500/20 transition-all">
          <Database size={14} /> Download Backup
        </button>
      </div>
    </div>
  );
}

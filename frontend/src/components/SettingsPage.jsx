import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Save, RotateCcw } from 'lucide-react';

const PROVIDER_OPTIONS = [
  { value: 'litellm', label: 'LiteLLM (Cloud — Gemini, GPT, Claude, etc.)' },
  { value: 'ollama', label: 'Ollama (Local — Qwen, Llama, Mistral, etc.)' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(console.error);
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // Don't send masked values back — only send if user changed it
      const payload = { ...settings };
      if (payload.litellm_api_key === '••••••••') {
        delete payload.litellm_api_key;
      }
      const updated = await api.updateSettings(payload);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert('Failed to save: ' + e.message);
    }
    setSaving(false);
  };

  if (!settings) return <div className="p-8 text-zinc-600">Loading settings...</div>;

  const isLiteLLM = settings.ai_provider === 'litellm';

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <h2 className="text-lg font-semibold text-zinc-200 mb-4">Settings</h2>

      {/* AI Configuration */}
      <div className="glass rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">AI Configuration</h3>

        <div className="space-y-3">
          {/* AI Enabled */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-zinc-400">AI Enabled</label>
            <button
              onClick={() => setSettings({ ...settings, ai_enabled: settings.ai_enabled === 'true' ? 'false' : 'true' })}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.ai_enabled === 'true' ? 'bg-blue-600' : 'bg-zinc-700'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${settings.ai_enabled === 'true' ? 'left-5.5 right-0.5' : 'left-0.5'}`}
                style={{ left: settings.ai_enabled === 'true' ? '22px' : '2px' }} />
            </button>
          </div>

          {/* Provider */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Provider</label>
            <select
              value={settings.ai_provider}
              onChange={e => setSettings({ ...settings, ai_provider: e.target.value })}
              className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
            >
              {PROVIDER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Provider URL */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">
              {isLiteLLM ? 'LiteLLM Base URL' : 'Ollama Base URL'}
            </label>
            <input
              value={isLiteLLM ? settings.litellm_base_url : settings.ollama_base_url}
              onChange={e => setSettings({
                ...settings,
                [isLiteLLM ? 'litellm_base_url' : 'ollama_base_url']: e.target.value
              })}
              className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
            />
          </div>

          {/* API Key (LiteLLM only) */}
          {isLiteLLM && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">LiteLLM API Key</label>
              <input
                type="password"
                value={settings.litellm_api_key || ''}
                onChange={e => setSettings({ ...settings, litellm_api_key: e.target.value })}
                placeholder="Enter new key to change"
                className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
              />
              <p className="text-xs text-zinc-600 mt-1">Leave as-is to keep current key. Clear and enter a new value to change.</p>
            </div>
          )}

          {/* Classification Model */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Classification Model</label>
            <input
              value={settings.classification_model}
              onChange={e => setSettings({ ...settings, classification_model: e.target.value })}
              placeholder={isLiteLLM ? 'gemini/gemini-2.5-flash-preview-05-20' : 'qwen3-coder:30b'}
              className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
            />
            <p className="text-xs text-zinc-600 mt-1">Used for classifying captures (type, urgency, linking)</p>
          </div>

          {/* Profile Model */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Profile Parsing Model</label>
            <input
              value={settings.profile_model}
              onChange={e => setSettings({ ...settings, profile_model: e.target.value })}
              placeholder={isLiteLLM ? 'gemini/gemini-2.5-flash-preview-05-20' : 'qwen3-coder:30b'}
              className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
            />
            <p className="text-xs text-zinc-600 mt-1">Used for extracting profile fields from captures</p>
          </div>
        </div>
      </div>

      {/* Resolution Thresholds */}
      <div className="glass rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Resolution Thresholds</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Auto-resolve confidence</label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={settings.confidence_auto_resolve}
              onChange={e => setSettings({ ...settings, confidence_auto_resolve: e.target.value })}
              className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
            />
            <p className="text-xs text-zinc-600 mt-1">Above this: auto-complete matching items</p>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Suggest confidence</label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={settings.confidence_suggest}
              onChange={e => setSettings({ ...settings, confidence_suggest: e.target.value })}
              className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
            />
            <p className="text-xs text-zinc-600 mt-1">Above this: suggest resolution to user</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 bg-blue-600/80 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg border border-blue-500/20 transition-all disabled:opacity-40"
        >
          <Save size={14} /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && <span className="text-xs text-blue-400">Settings saved successfully</span>}
      </div>
    </div>
  );
}

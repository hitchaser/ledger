import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Save, Sun, Moon, User } from 'lucide-react';
import PersonTypeahead from './PersonTypeahead';

const MODEL_PRESETS = [
  { group: 'LiteLLM (Cloud)', provider: 'litellm', models: [
    { value: 'gemini/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ]},
  { group: 'Ollama (Local)', provider: 'ollama', models: [
    { value: 'qwen3-coder:30b', label: 'Qwen3-Coder 30B' },
    { value: 'mistral-small3', label: 'Mistral Small 3' },
    { value: 'phi4:14b', label: 'Phi-4 14B' },
    { value: 'llama3.1:8b', label: 'Llama 3.1 8B' },
    { value: 'qwen3.5:4b', label: 'Qwen3.5 4B' },
  ]},
];

function ModelSelector({ modelValue, providerValue, onChange, label, description }) {
  const [custom, setCustom] = useState(false);

  const isPreset = MODEL_PRESETS.some(g => g.models.some(m => m.value === modelValue));
  const showCustom = custom || !isPreset;

  const handlePresetSelect = (model, provider) => {
    onChange({ model, provider });
    setCustom(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-zinc-500">{label}</label>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          providerValue === 'litellm'
            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
            : 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
        }`}>
          {providerValue === 'litellm' ? 'Cloud' : 'Local'}
        </span>
      </div>
      {!showCustom ? (
        <div>
          <div className="grid gap-1.5">
            {MODEL_PRESETS.map(group => (
              <div key={group.group}>
                <span className="text-xs text-zinc-600">{group.group}</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {group.models.map(m => (
                    <button
                      key={m.value}
                      onClick={() => handlePresetSelect(m.value, group.provider)}
                      className={`px-2.5 py-1.5 rounded text-xs transition-all ${
                        modelValue === m.value
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'glass glass-hover text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setCustom(true)} className="text-xs text-zinc-600 hover:text-zinc-400 mt-2 transition-colors">
            Use custom model name...
          </button>
        </div>
      ) : (
        <div>
          <div className="flex gap-2 mb-1.5">
            {['litellm', 'ollama'].map(p => (
              <button key={p} onClick={() => onChange({ provider: p })}
                className={`px-2 py-1 rounded text-xs transition-all ${
                  providerValue === p
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'glass text-zinc-500 hover:text-zinc-300'
                }`}>
                {p === 'litellm' ? 'Cloud' : 'Local'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={modelValue}
              onChange={e => onChange({ model: e.target.value })}
              placeholder="model-name:tag"
              className="flex-1 glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
            />
            <button onClick={() => setCustom(false)} className="text-xs text-zinc-600 hover:text-zinc-400 px-2 transition-colors">
              Presets
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-zinc-600 mt-1">{description}</p>
    </div>
  );
}

export default function SettingsPage({ theme, onToggleTheme }) {
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
      const payload = { ...settings };
      if (payload.litellm_api_key === '••••••••') {
        delete payload.litellm_api_key;
      }
      // Clean up legacy global provider if present
      delete payload.ai_provider;
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

  const showLiteLLMConfig = settings.classification_provider === 'litellm' || settings.profile_provider === 'litellm';
  const showOllamaConfig = settings.classification_provider === 'ollama' || settings.profile_provider === 'ollama';

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <h2 className="text-lg font-semibold text-zinc-200 mb-4">Settings</h2>

      {/* Appearance */}
      <div className="glass rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Appearance</h3>
        <div className="flex items-center justify-between">
          <label className="text-sm text-zinc-400">Theme</label>
          <div className="flex items-center gap-2">
            <Sun size={14} className={theme === 'light' ? 'text-amber-400' : 'text-zinc-600'} />
            <button
              onClick={onToggleTheme}
              className={`w-10 h-5 rounded-full transition-colors relative ${theme === 'dark' ? 'bg-blue-600' : 'bg-zinc-300'}`}
            >
              <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                style={{ left: theme === 'dark' ? '22px' : '2px' }} />
            </button>
            <Moon size={14} className={theme === 'dark' ? 'text-blue-400' : 'text-zinc-400'} />
          </div>
        </div>
      </div>

      {/* Identity */}
      <div className="glass rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-1.5"><User size={14} /> Identity</h3>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">I am...</label>
          <PersonTypeahead
            value={settings.owner_person_id || null}
            onChange={(p) => setSettings(s => ({ ...s, owner_person_id: p?.id || '' }))}
            placeholder="Search for yourself..."
          />
          <p className="text-xs text-zinc-600 mt-1">Select yourself to exclude from stale contacts and other self-references</p>
        </div>
      </div>

      {/* AI Configuration */}
      <div className="glass rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">AI Configuration</h3>

        <div className="space-y-4">
          {/* AI Enabled */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-zinc-400">AI Enabled</label>
            <button
              onClick={() => setSettings({ ...settings, ai_enabled: settings.ai_enabled === 'true' ? 'false' : 'true' })}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.ai_enabled === 'true' ? 'bg-blue-600' : 'bg-zinc-700'}`}
            >
              <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                style={{ left: settings.ai_enabled === 'true' ? '22px' : '2px' }} />
            </button>
          </div>

          {/* Classification Model */}
          <ModelSelector
            modelValue={settings.classification_model}
            providerValue={settings.classification_provider || 'litellm'}
            onChange={({ model, provider }) => setSettings(s => ({ ...s, ...(model !== undefined && { classification_model: model }), ...(provider !== undefined && { classification_provider: provider }) }))}
            label="Classification Model"
            description="Classifies captures — type, people/project linking, due dates, resolution matching"
          />

          {/* Profile Model */}
          <ModelSelector
            modelValue={settings.profile_model}
            providerValue={settings.profile_provider || 'ollama'}
            onChange={({ model, provider }) => setSettings(s => ({ ...s, ...(model !== undefined && { profile_model: model }), ...(provider !== undefined && { profile_provider: provider }) }))}
            label="Profile Parsing Model"
            description="Extracts structured profile fields from captures (e.g. 'daughter named Susan' → Children)"
          />
        </div>
      </div>

      {/* Provider URLs */}
      <div className="glass rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Provider Configuration</h3>
        <div className="space-y-3">
          {showLiteLLMConfig && (
            <>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">LiteLLM Base URL</label>
                <input
                  value={settings.litellm_base_url}
                  onChange={e => setSettings({ ...settings, litellm_base_url: e.target.value })}
                  className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">LiteLLM API Key</label>
                <input
                  type="password"
                  value={settings.litellm_api_key || ''}
                  onChange={e => setSettings({ ...settings, litellm_api_key: e.target.value })}
                  placeholder="Enter new key to change"
                  className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
                />
                <p className="text-xs text-zinc-600 mt-1">Leave as-is to keep current key</p>
              </div>
            </>
          )}
          {showOllamaConfig && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Ollama Base URL</label>
              <input
                value={settings.ollama_base_url}
                onChange={e => setSettings({ ...settings, ollama_base_url: e.target.value })}
                className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none"
              />
            </div>
          )}
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

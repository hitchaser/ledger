import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { Save, Sun, Moon, User, ShieldCheck, Copy, Check } from 'lucide-react';
import PersonTypeahead from './PersonTypeahead';
import { useDelayedLoading } from '../hooks/useDelayedLoading';

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

function SecuritySection() {
  const [status, setStatus] = useState(null);
  const [setupData, setSetupData] = useState(null); // { secret, qr_code }
  const [confirmCode, setConfirmCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedCodes, setSavedCodes] = useState(false);
  const confirmRef = useRef(null);

  useEffect(() => {
    api.getTotpStatus().then(setStatus).catch(console.error);
  }, []);

  const startSetup = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await api.setupTotp();
      setSetupData(data);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const confirmSetup = async () => {
    if (confirmCode.length < 6) return;
    setError('');
    setLoading(true);
    try {
      const data = await api.confirmTotp(confirmCode, setupData.secret);
      setBackupCodes(data.backup_codes);
      setSetupData(null);
      setConfirmCode('');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const finishSetup = () => {
    setBackupCodes(null);
    setSavedCodes(false);
    setStatus({ enabled: true, backup_codes_remaining: 8 });
  };

  const disable2FA = async () => {
    if (disableCode.length < 6) return;
    setError('');
    setLoading(true);
    try {
      await api.disableTotp(disableCode);
      setStatus({ enabled: false, backup_codes_remaining: 0 });
      setDisableCode('');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    setSavedCodes(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!status) return null;

  return (
    <div className="glass rounded-lg p-4 mb-4">
      <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-1.5">
        <ShieldCheck size={14} /> Security
      </h3>

      {error && (
        <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Backup codes display after setup */}
      {backupCodes && (
        <div>
          <p className="text-sm text-zinc-300 mb-2">2FA is now enabled. Save these backup codes somewhere safe — each can only be used once.</p>
          <div className="glass rounded-lg p-3 mb-3 font-mono text-sm text-zinc-200 grid grid-cols-2 gap-1">
            {backupCodes.map((c, i) => <div key={i}>{c}</div>)}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copyBackupCodes} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 glass px-3 py-1.5 rounded transition-colors">
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy codes</>}
            </button>
            <button
              onClick={finishSetup}
              disabled={!savedCodes}
              className="flex items-center gap-1 text-xs bg-blue-600/80 hover:bg-blue-500 text-white px-3 py-1.5 rounded border border-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              I've saved these
            </button>
            {!savedCodes && <span className="text-xs text-zinc-600">Copy codes first</span>}
          </div>
        </div>
      )}

      {/* Setup flow */}
      {!backupCodes && setupData && (
        <div>
          <p className="text-sm text-zinc-400 mb-3">Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.</p>
          <div className="flex justify-center mb-3">
            <img src={setupData.qr_code} alt="TOTP QR Code" className="w-48 h-48 rounded-lg" />
          </div>
          <div className="mb-3">
            <label className="text-xs text-zinc-500 mb-1 block">Manual entry key</label>
            <code className="text-xs text-zinc-400 glass px-2 py-1 rounded select-all break-all block">{setupData.secret}</code>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 mb-1 block">Confirmation code</label>
              <input
                ref={confirmRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={confirmCode}
                onChange={e => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') confirmSetup(); }}
                placeholder="000000"
                className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none font-mono tracking-widest"
              />
            </div>
            <button
              onClick={confirmSetup}
              disabled={loading || confirmCode.length < 6}
              className="bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded border border-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Verifying...' : 'Confirm'}
            </button>
          </div>
          <button onClick={() => { setSetupData(null); setError(''); }} className="text-xs text-zinc-600 hover:text-zinc-400 mt-2 transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Status display */}
      {!backupCodes && !setupData && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm text-zinc-400">Two-Factor Authentication</span>
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                status.enabled
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  : 'bg-zinc-700/50 text-zinc-500 border border-zinc-600/20'
              }`}>
                {status.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {status.enabled && (
            <p className="text-xs text-zinc-600 mb-3">
              {status.backup_codes_remaining} backup code{status.backup_codes_remaining !== 1 ? 's' : ''} remaining
            </p>
          )}

          {!status.enabled ? (
            <button
              onClick={startSetup}
              disabled={loading}
              className="text-sm bg-blue-600/80 hover:bg-blue-500 text-white px-4 py-2 rounded-lg border border-blue-500/20 disabled:opacity-40 transition-all"
            >
              {loading ? 'Loading...' : 'Set Up 2FA'}
            </button>
          ) : (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-zinc-500 mb-1 block">Enter current TOTP code to disable</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={disableCode}
                  onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => { if (e.key === 'Enter') disable2FA(); }}
                  placeholder="000000"
                  className="w-full glass-input rounded px-3 py-2 text-sm text-zinc-200 outline-none font-mono tracking-widest"
                />
              </div>
              <button
                onClick={disable2FA}
                disabled={loading || disableCode.length < 6}
                className="bg-rose-600/80 hover:bg-rose-500 text-white text-sm px-4 py-2 rounded border border-rose-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </div>
          )}
        </div>
      )}
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

  const showLoading = useDelayedLoading(!settings);
  if (!settings) return showLoading ? <div className="p-8 text-zinc-600">Loading settings...</div> : null;

  const showLiteLLMConfig = settings.classification_provider === 'litellm' || settings.profile_provider === 'litellm';
  const showOllamaConfig = settings.classification_provider === 'ollama' || settings.profile_provider === 'ollama';

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 page-transition">
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
      <div className="glass rounded-lg p-4 mb-4 relative z-20 overflow-visible">
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

      {/* Security */}
      <SecuritySection />

      {/* AI Configuration */}
      <div className="glass rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">AI Configuration</h3>

        <div className="space-y-4">
          {/* AI Enabled */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-400">AI Enabled</label>
              {settings.ai_env_locked && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  ENV
                </span>
              )}
            </div>
            <button
              onClick={() => !settings.ai_env_locked && setSettings({ ...settings, ai_enabled: settings.ai_enabled === 'true' ? 'false' : 'true' })}
              disabled={settings.ai_env_locked}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.ai_enabled === 'true' ? 'bg-blue-600' : 'bg-zinc-700'} ${settings.ai_env_locked ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                style={{ left: settings.ai_enabled === 'true' ? '22px' : '2px' }} />
            </button>
          </div>
          {settings.ai_env_locked && (
            <p className="text-xs text-amber-400/70 -mt-2">Controlled by AI_ENABLED environment variable — cannot be changed from here</p>
          )}

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

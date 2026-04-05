const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (res.status === 401) {
    // Session expired or invalid — reload to trigger auth check
    window.location.reload();
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Captures
  createCapture: (raw_text) => request('/captures', { method: 'POST', body: JSON.stringify({ raw_text }) }),
  listCaptures: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/captures${qs ? '?' + qs : ''}`);
  },
  updateCapture: (id, data) => request(`/captures/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCapture: (id) => request(`/captures/${id}`, { method: 'DELETE' }),
  reorderCaptures: (item_ids) => request('/captures/reorder', { method: 'POST', body: JSON.stringify({ item_ids }) }),
  linkPerson: (itemId, personId) => request(`/captures/${itemId}/link-person/${personId}`, { method: 'POST' }),
  unlinkPerson: (itemId, personId) => request(`/captures/${itemId}/link-person/${personId}`, { method: 'DELETE' }),
  linkProject: (itemId, projectId) => request(`/captures/${itemId}/link-project/${projectId}`, { method: 'POST' }),
  unlinkProject: (itemId, projectId) => request(`/captures/${itemId}/link-project/${projectId}`, { method: 'DELETE' }),

  // People
  listPeople: (params = {}) => {
    if (typeof params === 'boolean') params = params ? { include_archived: 'true' } : {};
    const qs = new URLSearchParams(params).toString();
    return request(`/people${qs ? '?' + qs : ''}`);
  },
  listAllPeople: () => request('/people?include_archived=true&limit=10000'),
  searchPeople: (q, limit = 10) => request(`/people/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  createPerson: (data) => request('/people', { method: 'POST', body: JSON.stringify(data) }),
  getPerson: (id) => request(`/people/${id}`),
  updatePerson: (id, data) => request(`/people/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getPersonItems: (id, status = 'open') => request(`/people/${id}/items?status=${status}`),
  getPersonLogs: (id) => request(`/people/${id}/logs`),
  deletePerson: (id) => request(`/people/${id}`, { method: 'DELETE' }),
  mergePerson: (sourceId, targetId) => request(`/people/${sourceId}/merge/${targetId}`, { method: 'POST' }),
  linkPersonProject: (personId, projectId) => request(`/people/${personId}/projects/${projectId}`, { method: 'POST' }),
  unlinkPersonProject: (personId, projectId) => request(`/people/${personId}/projects/${projectId}`, { method: 'DELETE' }),

  // Projects
  listProjects: (includeArchived = false) => request(`/projects${includeArchived ? '?include_archived=true' : ''}`),
  createProject: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  getProject: (id) => request(`/projects/${id}`),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getProjectItems: (id, status = 'open') => request(`/projects/${id}/items?status=${status}`),
  getProjectLogs: (id) => request(`/projects/${id}/logs`),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  linkProjectPerson: (projectId, personId) => request(`/projects/${projectId}/people/${personId}`, { method: 'POST' }),
  unlinkProjectPerson: (projectId, personId) => request(`/projects/${projectId}/people/${personId}`, { method: 'DELETE' }),

  // Meetings
  listMeetings: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/meetings${qs ? '?' + qs : ''}`);
  },
  startMeeting: (data) => request('/meetings', { method: 'POST', body: JSON.stringify(data) }),
  getMeeting: (id) => request(`/meetings/${id}`),
  updateMeeting: (id, data) => request(`/meetings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  endMeeting: (id) => request(`/meetings/${id}/end`, { method: 'PATCH' }),
  deleteMeeting: (id) => request(`/meetings/${id}`, { method: 'DELETE' }),
  getActiveMeeting: () => request('/meetings/active'),
  addMeetingAttendee: (meetingId, personId) => request(`/meetings/${meetingId}/attendees/${personId}`, { method: 'POST' }),
  removeMeetingAttendee: (meetingId, personId) => request(`/meetings/${meetingId}/attendees/${personId}`, { method: 'DELETE' }),
  forceEndActiveMeeting: async () => {
    const active = await request('/meetings/active');
    if (active && active.id) {
      return request(`/meetings/${active.id}/end`, { method: 'PATCH' });
    }
    return null;
  },

  // Item Notes
  addNote: (itemId, content) => request(`/captures/${itemId}/notes`, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteNote: (itemId, noteId) => request(`/captures/${itemId}/notes/${noteId}`, { method: 'DELETE' }),

  // Predecessors
  addPredecessor: (itemId, predId) => request(`/captures/${itemId}/predecessors/${predId}`, { method: 'POST' }),
  removePredecessor: (itemId, predId) => request(`/captures/${itemId}/predecessors/${predId}`, { method: 'DELETE' }),

  // Digest
  getDigest: () => request('/digest'),

  // Search
  universalSearch: (q) => request(`/search?q=${encodeURIComponent(q)}`),

  // Timeline
  getTimeline: (days = 7) => request(`/timeline?days=${days}`),

  // Meeting Prep
  getMeetingPrep: (type, id) => request(`/meetings/prep/${type}/${id}`),

  // Import/Export — Org XLSX
  previewOrgImport: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/import-export/org-preview', { method: 'POST', body: form });
    if (res.status === 401) { window.location.reload(); throw new Error('Session expired'); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  commitOrgImport: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/import-export/org-commit', { method: 'POST', body: form });
    if (res.status === 401) { window.location.reload(); throw new Error('Session expired'); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Import/Export — Generic CSV
  previewImport: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/import-export/preview', { method: 'POST', body: form });
    if (res.status === 401) { window.location.reload(); throw new Error('Session expired'); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  commitImport: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/import-export/commit', { method: 'POST', body: form });
    if (res.status === 401) { window.location.reload(); throw new Error('Session expired'); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  exportTeam: (columns, format = 'csv') => `/api/import-export/export/team?columns=${columns}&format=${format}`,
  exportBackup: () => '/api/import-export/export/backup',

  // Org Chart
  getOrgTree: (focus = null) => request(`/org/tree${focus ? '?focus=' + focus : ''}`),
  getFocusedTree: (focus = null) => request(`/org/focused-tree${focus ? '?focus=' + focus : ''}`),
  getOrgChildren: (personId) => request(`/org/children/${personId}`),
  getOrgChain: (personId) => request(`/org/chain/${personId}`),
  getMyOrgIds: () => request('/org/my-org'),

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};

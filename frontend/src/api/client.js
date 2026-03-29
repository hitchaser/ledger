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
  linkPerson: (itemId, personId) => request(`/captures/${itemId}/link-person/${personId}`, { method: 'POST' }),
  unlinkPerson: (itemId, personId) => request(`/captures/${itemId}/link-person/${personId}`, { method: 'DELETE' }),
  linkProject: (itemId, projectId) => request(`/captures/${itemId}/link-project/${projectId}`, { method: 'POST' }),
  unlinkProject: (itemId, projectId) => request(`/captures/${itemId}/link-project/${projectId}`, { method: 'DELETE' }),

  // People
  listPeople: (includeArchived = false) => request(`/people${includeArchived ? '?include_archived=true' : ''}`),
  listAllPeople: () => request('/people?include_archived=true'),
  createPerson: (data) => request('/people', { method: 'POST', body: JSON.stringify(data) }),
  getPerson: (id) => request(`/people/${id}`),
  updatePerson: (id, data) => request(`/people/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getPersonItems: (id, status = 'open') => request(`/people/${id}/items?status=${status}`),
  getPersonLogs: (id) => request(`/people/${id}/logs`),
  deletePerson: (id) => request(`/people/${id}`, { method: 'DELETE' }),
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
  startMeeting: (data) => request('/meetings', { method: 'POST', body: JSON.stringify(data) }),
  endMeeting: (id) => request(`/meetings/${id}/end`, { method: 'PATCH' }),
  getActiveMeeting: () => request('/meetings/active'),
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

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};

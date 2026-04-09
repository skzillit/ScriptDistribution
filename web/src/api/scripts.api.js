import client from './client';

export const scriptsApi = {
  list: (params) => client.get('/scripts', { params }),
  create: (data) => client.post('/scripts', data),
  get: (id) => client.get(`/scripts/${id}`),
  update: (id, data) => client.put(`/scripts/${id}`, data),
  delete: (id) => client.delete(`/scripts/${id}`),
  addCollaborator: (id, data) => client.post(`/scripts/${id}/collaborators`, data),
  getActive: () => client.get('/scripts/active'),
  getHistory: (params) => client.get('/scripts/history', { params }),
  restore: (id) => client.post(`/scripts/${id}/restore`),

  // Versions
  listVersions: (scriptId) => client.get(`/scripts/${scriptId}/versions`),
  uploadVersion: (scriptId, formData, onProgress) =>
    client.post(`/scripts/${scriptId}/versions`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }),
  getVersion: (versionId) => client.get(`/versions/${versionId}`),
  getPages: (versionId) => client.get(`/versions/${versionId}/pages`),
  getPage: (versionId, pageNumber) => client.get(`/versions/${versionId}/pages/${pageNumber}`),
  downloadVersion: (versionId) => client.get(`/versions/${versionId}/download`),
  getScenes: (versionId) => client.get(`/versions/${versionId}/scenes`),
};

export const breakdownApi = {
  trigger: (versionId, provider, mode) => {
    const params = new URLSearchParams();
    if (provider) params.set('provider', provider);
    if (mode) params.set('mode', mode);
    const qs = params.toString();
    return client.post(`/versions/${versionId}/breakdown${qs ? `?${qs}` : ''}`);
  },
  get: (versionId) => client.get(`/versions/${versionId}/breakdown`),
  updateElement: (breakdownId, elementId, data) =>
    client.put(`/breakdown/${breakdownId}/elements/${elementId}`, data),
  addElement: (breakdownId, data) =>
    client.post(`/breakdown/${breakdownId}/elements`, data),
  deleteElement: (breakdownId, elementId) =>
    client.delete(`/breakdown/${breakdownId}/elements/${elementId}`),
};

export const callSheetApi = {
  upload: (formData, onProgress) =>
    client.post('/callsheets', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }),
  list: (params) => client.get('/callsheets', { params }),
  listHistory: (params) => client.get('/callsheets', { params: { ...params, history: 'true' } }),
  get: (id) => client.get(`/callsheets/${id}`),
  update: (id, data) => client.put(`/callsheets/${id}`, data),
  delete: (id) => client.delete(`/callsheets/${id}`),
};

export const sidesApi = {
  generate: (data) => client.post('/sides', data),
  list: (params) => client.get('/sides', { params }),
  listHistory: (params) => client.get('/sides', { params: { ...params, history: 'true' } }),
  get: (id) => client.get(`/sides/${id}`),
  download: (id) => client.get(`/sides/${id}/download`),
  delete: (id) => client.delete(`/sides/${id}`),
};

export const scheduleApi = {
  upload: (formData, onProgress) =>
    client.post('/schedules', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }),
  list: (params) => client.get('/schedules', { params }),
  get: (id) => client.get(`/schedules/${id}`),
  update: (id, data) => client.put(`/schedules/${id}`, data),
  delete: (id) => client.delete(`/schedules/${id}`),
  download: (id) => client.get(`/schedules/${id}/download`),
};

export const analyticsApi = {
  recordEvent: (data) => client.post('/analytics/event', data),
  getAnalytics: (scriptId, params) => client.get(`/analytics/scripts/${scriptId}`, { params }),
  getViewers: (scriptId) => client.get(`/analytics/scripts/${scriptId}/viewers`),
  getDownloads: (scriptId) => client.get(`/analytics/scripts/${scriptId}/downloads`),
};

export const scriptBreakdownApi = {
  getScenesList: (versionId) => client.get(`/versions/${versionId}/scenes-list`),
  getCategories: (scriptId) => client.get(`/scripts/${scriptId}/breakdown/categories`),
  getBreakdownSheet: (scriptId, sceneId) => client.get(`/scripts/${scriptId}/breakdown/scenes/${sceneId}`),
  tagText: (scriptId, sceneId, data) => client.post(`/scripts/${scriptId}/breakdown/scenes/${sceneId}/tag`, data),
  removeTag: (scriptId, tagId) => client.delete(`/scripts/${scriptId}/breakdown/tags/${tagId}`),
  aiAnalyze: (scriptId, sceneId) => client.post(`/scripts/${scriptId}/breakdown/scenes/${sceneId}/ai-analyze`),
  bulkDecisions: (scriptId, sceneId, decisions) => client.post(`/scripts/${scriptId}/breakdown/scenes/${sceneId}/bulk-decisions`, { decisions }),
  getElements: (scriptId, params) => client.get(`/scripts/${scriptId}/breakdown/elements`, { params }),
};

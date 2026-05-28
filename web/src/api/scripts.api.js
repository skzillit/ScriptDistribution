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

// Scene "folders" (Pages) attached to a script.
export const scenePagesApi = {
  list: (scriptId) => client.get(`/scripts/${scriptId}/pages`),
  create: (scriptId, formData, onProgress) =>
    client.post(`/scripts/${scriptId}/pages`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }),
  update: (id, formData) =>
    client.put(`/pages/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  remove: (id) => client.delete(`/pages/${id}`),
  download: (id) => client.get(`/pages/${id}/download`),
  scenes: (id) => client.get(`/pages/${id}/scenes`),
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
  publish: (id) => client.post(`/sides/${id}/publish`),
  moveToDocDistribution: (id) => client.post(`/sides/${id}/doc-distribution`),
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


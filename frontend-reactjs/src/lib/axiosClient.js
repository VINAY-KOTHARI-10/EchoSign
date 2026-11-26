// Axios, used next to the app's own fetch helper (src/api/client.js). INT252, Unit V: "Fetch API and Axios usage patterns".
// The two do the same job in different styles. Here Axios is used for read-only requests (see Leaderboard and Library):
//   - an instance with a base address and cookies,
//   - a request interceptor that adds the access token,
//   - a response interceptor that renews an expired login once and retries, and turns errors into a plain Error whose
//     message is the server's own text (the same shape the rest of the app expects).
import axios from 'axios';
import { API_URL, getToken, refreshAccessToken } from '../api/client';

export const http = axios.create({ baseURL: API_URL, withCredentials: true, headers: { 'Content-Type': 'application/json' } });

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && config && !config.retried && !String(config.url || '').startsWith('/auth/')) {
      config.retried = true;
      if (await refreshAccessToken()) return http(config);
    }
    const friendly = new Error(response?.data?.error || (error.request ? 'The server could not be reached. Please try again.' : error.message));
    friendly.status = response?.status;
    return Promise.reject(friendly);
  },
);

// The backend wraps every answer as { success, data }; this returns just `data`.
export const getData = (path, params) => http.get(path, { params }).then((res) => res.data.data);

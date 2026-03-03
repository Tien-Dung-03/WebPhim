const ACCESS_TOKEN_KEY = "wp_access_token";
const REFRESH_TOKEN_KEY = "wp_refresh_token";
const USER_KEY = "wp_user";

export function setAuth(data) {
  if (data.access) localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
  if (data.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
  if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearAuth() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return Boolean(getAccessToken());
}

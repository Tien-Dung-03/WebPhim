import apiClient from "./client";

export async function register(payload) {
  const { data } = await apiClient.post("/user/api/register", payload);
  return data;
}

export async function login(payload) {
  const { data } = await apiClient.post("/user/api/login", payload);
  return data;
}

export async function getMyProfile() {
  const { data } = await apiClient.get("/user/api/me");
  return data;
}

export async function updateMyProfile(payload) {
  const config = payload instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : undefined;
  const { data } = await apiClient.patch("/user/api/me", payload, config);
  return data;
}

export async function logout(refresh) {
  const { data } = await apiClient.post("/user/api/logout/", { refresh });
  return data;
}

export async function loginGoogle(payload) {
  const { data } = await apiClient.post("/user/api/login/google", payload);
  return data;
}

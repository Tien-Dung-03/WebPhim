import apiClient from "./client";

export async function getMovies(params = {}) {
  const response = await apiClient.get("/movie/api/movies", { params });
  return response.data;
}

export async function getMovieDetail(slug) {
  const response = await apiClient.get(`/movie/api/movies/${slug}`);
  return response.data;
}

export async function getMovieHome() {
  const response = await apiClient.get("/movie/api/home");
  return response.data;
}

export async function getMovieFilterOptions() {
  const response = await apiClient.get("/movie/api/filter-options");
  return response.data;
}

export async function getMovieComments(slug) {
  const response = await apiClient.get(`/movie/api/movies/${slug}/comments`);
  return response.data;
}

export async function createMovieComment(slug, payload) {
  const response = await apiClient.post(`/movie/api/movies/${slug}/comments`, payload);
  return response.data;
}

export async function getMovieRatings(slug) {
  const response = await apiClient.get(`/movie/api/movies/${slug}/ratings`);
  return response.data;
}

export async function createMovieRating(slug, payload) {
  const response = await apiClient.post(`/movie/api/movies/${slug}/ratings`, payload);
  return response.data;
}

export async function toggleFavorite(slug) {
  const response = await apiClient.post(`/movie/api/movies/${slug}/favorite`);
  return response.data;
}

export async function getFavorites() {
  const response = await apiClient.get("/movie/api/favorites");
  return response.data;
}

export async function getWatchHistory() {
  const response = await apiClient.get("/movie/api/watch-history");
  return response.data;
}

export async function saveWatchHistory(payload) {
  const response = await apiClient.post("/movie/api/watch-history", payload);
  return response.data;
}

export async function adminSyncMovies(payload) {
  const response = await apiClient.post("/movie/api/admin/sync", payload);
  return response.data;
}

export async function adminGetSyncJob(jobId) {
  const response = await apiClient.get(`/movie/api/admin/sync/${jobId}`);
  return response.data;
}

export async function getStreamOptions(m3u8) {
  const response = await apiClient.get("/movie/api/stream-options", { params: { m3u8 } });
  return response.data;
}

export async function adminGetAnalytics() {
  const response = await apiClient.get("/movie/api/admin/analytics");
  return response.data;
}

export async function adminGetMovies(params = {}) {
  const response = await apiClient.get("/movie/api/admin/movies", { params });
  return response.data;
}

export async function adminGetTrashMovies() {
  const response = await apiClient.get("/movie/api/admin/movies/trash");
  return response.data;
}

export async function adminBulkAction(payload) {
  const response = await apiClient.post("/movie/api/admin/movies/bulk-action", payload);
  return response.data;
}

export async function adminGetCategories() {
  const response = await apiClient.get("/movie/api/admin/categories");
  return response.data;
}

export async function adminCreateCategory(payload) {
  const response = await apiClient.post("/movie/api/admin/categories", payload);
  return response.data;
}

export async function adminUpdateCategory(payload) {
  const response = await apiClient.patch("/movie/api/admin/categories", payload);
  return response.data;
}

export async function adminDeleteCategory(id) {
  const response = await apiClient.delete("/movie/api/admin/categories", { data: { id } });
  return response.data;
}

export async function adminGetHomepageConfig() {
  const response = await apiClient.get("/movie/api/admin/homepage-config");
  return response.data;
}

export async function adminUpdateHomepageConfig(payload) {
  const response = await apiClient.post("/movie/api/admin/homepage-config", payload);
  return response.data;
}

export async function adminGetActivityLogs() {
  const response = await apiClient.get("/movie/api/admin/activity-logs");
  return response.data;
}

export async function adminGetCommentReports(params = {}) {
  const response = await apiClient.get("/movie/api/admin/comment-reports", { params });
  return response.data;
}

export async function adminReviewCommentReport(payload) {
  const response = await apiClient.post("/movie/api/admin/comment-reports", payload);
  return response.data;
}

export async function adminGetPermissions() {
  const response = await apiClient.get("/movie/api/admin/permissions");
  return response.data;
}

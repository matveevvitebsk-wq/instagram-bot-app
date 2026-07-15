import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Автоматически добавляем JWT к каждому запросу
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("jwt");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Обрабатываем 401 — разлогиниваем пользователя
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem("jwt");
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default api;

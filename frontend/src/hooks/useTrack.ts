import api from "@/utils/api";

export const useTrack = () => {
  const track = async (event_name: string, properties: Record<string, any> = {}) => {
    try {
      await api.post("/api/events/", { event_name, properties });
    } catch {
      // Тихо игнорируем ошибки трекинга
    }
  };

  return { track };
};

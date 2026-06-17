import { useEffect, useState } from "react";
import api from "@/utils/api";

export const useInstagram = () => {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/accounts/")
      .then((res) => {
        const accounts = res.data.accounts ?? res.data ?? [];
        setConnected(accounts.length > 0);
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  }, []);

  return { connected, loading };
};

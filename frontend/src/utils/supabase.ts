import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
    console.warn(
        "[Supabase] VITE_SUPABASE_URL или VITE_SUPABASE_PUBLISHABLE_KEY не заданы. " +
        "Realtime подписки работать не будут. Проверьте frontend/.env"
    );
}

export const supabase = createClient(
    supabaseUrl ?? "",
    supabasePublishableKey ?? ""
);

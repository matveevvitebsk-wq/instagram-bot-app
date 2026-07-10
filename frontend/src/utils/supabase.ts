import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
        "[Supabase] VITE_SUPABASE_URL или VITE_SUPABASE_ANON_KEY не заданы. " +
        "Realtime подписки работать не будут. Добавьте их в frontend/.env"
    );
}

export const supabase = createClient(
    supabaseUrl ?? "",
    supabaseAnonKey ?? ""
);
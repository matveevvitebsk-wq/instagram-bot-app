export default function Privacy() {
  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ padding: "20px 40px", borderBottom: "1px solid #222" }}>
        <span style={{ fontWeight: 700, fontSize: 18, background: "linear-gradient(90deg, #a855f7, #f97316)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MediaHave</span>
      </nav>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 24px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: "#666", marginBottom: 40 }}>Last updated: June 2026</p>

        {[
          { title: "1. Information We Collect", content: "When you connect your Instagram Business account to MediaHave, we collect your Telegram user ID, name, and username; your Instagram Business account ID and access token; messages and comments received on your Instagram account for automation purposes; and usage data and analytics within our application." },
          { title: "2. How We Use Your Information", content: "We use your information to provide automated responses to Instagram Direct Messages on your behalf, publish content to your Instagram account as scheduled by you, analyze engagement and provide AI-powered insights, and improve our services." },
          { title: "3. Data Storage", content: "Your data is stored securely using Supabase (PostgreSQL) with Row Level Security. Access tokens are stored encrypted. We do not sell your data to third parties." },
          { title: "4. Instagram Data", content: "We access your Instagram data only with your explicit permission through Meta\'s official OAuth flow. You can revoke access at any time through Instagram Settings → Apps and Websites, or through our app Settings page." },
          { title: "5. Data Retention", content: "We retain your data as long as your account is active. You can request deletion of your data by contacting us." },
          { title: "6. Contact", content: "For privacy questions contact us at support@almarathon.com or via Telegram @mediahave_bot" },
        ].map((section, i) => (
          <div key={i} style={{ background: "#1a1a1a", borderRadius: 16, padding: "24px 28px", marginBottom: 16, border: "1px solid #222" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#fff" }}>{section.title}</h2>
            <p style={{ color: "#999", lineHeight: 1.7, margin: 0 }}>{section.content}</p>
          </div>
        ))}

        <div style={{ marginTop: 40, textAlign: "center" }}>
          <a href="/" style={{ color: "#a855f7", textDecoration: "none", fontSize: 14 }}>← Вернуться на главную</a>
        </div>
      </div>
    </div>
  );
}

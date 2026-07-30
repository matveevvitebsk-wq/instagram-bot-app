export default function Terms() {
  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ padding: "20px 40px", borderBottom: "1px solid #222" }}>
        <span style={{ fontWeight: 700, fontSize: 18, background: "linear-gradient(90deg, #a855f7, #f97316)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MediaHave</span>
      </nav>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 24px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ color: "#666", marginBottom: 40 }}>Last updated: June 2026</p>

        {[
          { title: "1. Acceptance of Terms", content: "By using MediaHave, you agree to these Terms of Service and our Privacy Policy. If you do not agree, do not use the service." },
          { title: "2. Service Description", content: "MediaHave is an Instagram automation service accessible via Telegram Mini App. It provides keyword-triggered Direct Message auto-replies, scheduled publishing, and AI analytics for Instagram Business accounts." },
          { title: "3. Eligibility", content: "You must have a valid Instagram Business or Creator account and comply with Meta\'s Terms of Service and Community Guidelines." },
          { title: "4. Acceptable Use", content: "You agree NOT to use MediaHave to send spam or unsolicited messages, violate Instagram\'s Community Guidelines, harass or harm other users, or engage in any illegal activity." },
          { title: "5. Account Responsibility", content: "You are responsible for all activity on your account and for maintaining the security of your Telegram account." },
          { title: "6. Service Availability", content: "We strive for high availability but do not guarantee uninterrupted service. We are not liable for losses due to service interruptions." },
          { title: "7. Termination", content: "We reserve the right to suspend or terminate accounts that violate these terms." },
          { title: "8. Contact", content: "For questions contact us at support@almarathon.com or via Telegram @mediahave_bot" },
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

export default function Landing() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          background: #0a0a0f;
          color: #e8e8f0;
          font-family: 'Inter', sans-serif;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .landing {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        /* Фоновая сетка */
        .grid-bg {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 0;
        }

        /* Градиентное свечение */
        .glow {
          position: fixed;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%);
          top: -200px;
          right: -200px;
          pointer-events: none;
          z-index: 0;
        }

        .glow-2 {
          position: fixed;
          width: 400px;
          height: 400px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 70%);
          bottom: 0;
          left: -100px;
          pointer-events: none;
          z-index: 0;
        }

        /* Навбар */
        nav {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 40px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .logo {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #a5b4fc, #ec4899);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .nav-badge {
          font-size: 11px;
          font-weight: 500;
          color: #a5b4fc;
          background: rgba(99,102,241,0.15);
          border: 1px solid rgba(99,102,241,0.3);
          padding: 4px 10px;
          border-radius: 20px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        /* Герой */
        .hero {
          position: relative;
          z-index: 10;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 80px 24px 60px;
          gap: 32px;
        }

        .hero-tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #a5b4fc;
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.25);
          padding: 6px 16px;
          border-radius: 20px;
          font-weight: 500;
        }

        .hero-tag .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #6ee7b7;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        h1 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: clamp(42px, 8vw, 80px);
          font-weight: 700;
          line-height: 1.05;
          letter-spacing: -2px;
          max-width: 800px;
        }

        h1 .accent {
          background: linear-gradient(135deg, #a5b4fc 0%, #ec4899 50%, #f97316 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .subtitle {
          font-size: clamp(16px, 2.5vw, 20px);
          color: #9ca3af;
          max-width: 520px;
          line-height: 1.6;
          font-weight: 400;
        }

        /* Кнопка */
        .cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          font-family: 'Inter', sans-serif;
          font-size: 16px;
          font-weight: 600;
          padding: 16px 32px;
          border-radius: 14px;
          text-decoration: none;
          border: none;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 0 40px rgba(99,102,241,0.35);
        }

        .cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 60px rgba(99,102,241,0.5);
        }

        .cta-btn:active {
          transform: translateY(0);
        }

        .tg-icon {
          width: 22px;
          height: 22px;
          fill: white;
        }

        /* Карточки фич */
        .features {
          position: relative;
          z-index: 10;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          padding: 0 40px 80px;
          max-width: 960px;
          margin: 0 auto;
          width: 100%;
        }

        .feature-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 24px;
          transition: border-color 0.2s, background 0.2s;
        }

        .feature-card:hover {
          border-color: rgba(99,102,241,0.3);
          background: rgba(99,102,241,0.05);
        }

        .feature-icon {
          font-size: 28px;
          margin-bottom: 14px;
          display: block;
        }

        .feature-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 15px;
          font-weight: 600;
          color: #e8e8f0;
          margin-bottom: 6px;
        }

        .feature-desc {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.5;
        }

        /* Футер */
        footer {
          position: relative;
          z-index: 10;
          text-align: center;
          padding: 24px;
          border-top: 1px solid rgba(255,255,255,0.06);
          color: #4b5563;
          font-size: 13px;
        }

        /* Мобильная адаптация */
        @media (max-width: 640px) {
          nav { padding: 20px 24px; }
          .features { padding: 0 20px 60px; }
          h1 { letter-spacing: -1px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .dot { animation: none; }
          .cta-btn { transition: none; }
        }
      `}</style>

      <div className="landing">
        <div className="grid-bg" />
        <div className="glow" />
        <div className="glow-2" />

        {/* Навбар */}
        <nav>
          <span className="logo">MediaHave</span>
          <span className="nav-badge">Beta</span>
        </nav>

        {/* Герой */}
        <section className="hero">
          <div className="hero-tag">
            <span className="dot" />
            Работает прямо в Telegram
          </div>

          <h1>
            Соцсети на
            <br />
            <span className="accent">автопилоте</span>
          </h1>

          <p className="subtitle">
            Автоматизируйте Instagram: воронки, ответы в Direct,
            публикации и аналитику — всё через Telegram бот.
            Скоро больше платформ.
          </p>

          <a
            // href="https://t.me/mediahave_bot"
            className="cta-btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg className="tg-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.17 13.857l-2.965-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.983.702z"/>
            </svg>
            Открыть в Telegram
          </a>
        </section>

        {/* Фичи */}
        <div className="features">
          {[
            { icon: "🎯", title: "Ключевые воронки", desc: "Пользователь пишет слово — бот автоматически отправляет нужный материал в Direct" },
            { icon: "💬", title: "Авто-ответы в DM", desc: "Отвечайте на сообщения 24/7 без участия менеджера" },
            { icon: "📸", title: "Публикации по расписанию", desc: "Планируйте посты и Stories заранее, выходите в эфир вовремя" },
            { icon: "📊", title: "Аналитика с AI", desc: "Инсайты по аудитории и эффективности воронок каждую неделю" },
          ].map((f) => (
            <div key={f.title} className="feature-card">
              <span className="feature-icon">{f.icon}</span>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>

        <footer>
          © 2025 MediaHave · <a href="https://t.me/mediahave_bot" style={{color:"#6366f1",textDecoration:"none"}}>@mediahave_bot</a>
        </footer>
      </div>
    </>
  );
}

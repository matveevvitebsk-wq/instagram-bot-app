from app.services.instagram_oauth import (
    create_instagram_oauth_state,
    expired_start_page_html,
    instagram_auth_url,
    instagram_start_page_url,
    start_page_html,
    validate_oauth_state,
)


def test_oauth_state_roundtrip():
    state = create_instagram_oauth_state("5925521658")
    data = validate_oauth_state(state)
    assert data is not None
    assert data["telegram_id"] == "5925521658"


def test_invalid_oauth_state():
    assert validate_oauth_state("not-a-jwt") is None


def test_auth_url_does_not_force_web_login():
    state = create_instagram_oauth_state("1")
    url = instagram_auth_url(state)
    assert url.startswith("https://www.instagram.com/oauth/authorize")
    assert "force_authentication" not in url
    assert "force_reauth" not in url


def test_start_page_url_stays_on_api_domain():
    state = create_instagram_oauth_state("1")
    url = instagram_start_page_url(state)
    assert url.startswith("https://api.almarathon.com/api/instagram/meta/start-page")
    assert "instagram.com/accounts/login" not in url


def test_start_page_hands_off_to_instagram_app():
    html = start_page_html(
        "https://www.instagram.com/oauth/authorize?client_id=2007885943317419"
    )
    assert "com.instagram.android" in html
    assert "www.instagram.com/oauth/authorize" in html
    assert "TelegramWebviewProxy" in html
    assert "Открыть в Chrome" in html
    assert "if (!isEmbeddedBrowser())" in html
    assert "force_authentication" not in html
    assert "accounts/login" not in html


def test_expired_start_page_mentions_429():
    html = expired_start_page_html()
    assert "429" in html

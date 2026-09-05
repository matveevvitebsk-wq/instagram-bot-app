from app.services.login_devices import (
    normalize_device_kind,
    normalize_os_type,
    normalize_telegram_platform,
    record_user_login_device,
)


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeSupabase:
    def __init__(self, data=None, error=None):
        self.data = data
        self.error = error
        self.calls = []

    def rpc(self, name, payload):
        self.calls.append((name, payload))
        if self.error:
            raise self.error
        return self


    def execute(self):
        return FakeResult(self.data)


def test_normalize_device_and_os():
    assert normalize_device_kind("Phone") == "phone"
    assert normalize_device_kind("watch") == "computer"
    assert normalize_os_type("Android") == "android"
    assert normalize_os_type("harmony") == "unknown"
    assert normalize_telegram_platform("Android_X") == "android_x"
    assert normalize_telegram_platform("") == "unknown"


def test_record_user_login_device_calls_rpc():
    sb = FakeSupabase(
        data={
            "owner_id": "owner-1",
            "device_kind": "phone",
            "os_type": "ios",
            "login_count": 2,
        }
    )
    recorded = record_user_login_device(
        sb,
        owner_id="owner-1",
        telegram_id="123",
        device_kind="phone",
        os_type="ios",
        telegram_platform="ios",
    )
    assert recorded["login_count"] == 2
    assert sb.calls == [
        (
            "record_user_login_device",
            {
                "p_owner_id": "owner-1",
                "p_telegram_id": "123",
                "p_device_kind": "phone",
                "p_os_type": "ios",
                "p_telegram_platform": "ios",
            },
        )
    ]


def test_record_user_login_device_does_not_raise():
    sb = FakeSupabase(error=RuntimeError("rpc failed"))
    assert (
        record_user_login_device(
            sb,
            owner_id="owner-1",
            telegram_id="123",
            device_kind="tablet",
            os_type="android",
        )
        is None
    )

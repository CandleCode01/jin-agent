"""Dashboard plugin-catalog surface: GET /api/dashboard/plugins/catalog merges installed state via the
installer-owned install-metadata ``catalog`` record; the install endpoint has no kill-list bypass."""

from __future__ import annotations

import pytest
import jin_yaml as yaml

from jin_cli import plugin_catalog as pc_cat

VALID_SHA = "38fe0fb53eff98d477f807432e965429e665ca33"
OTHER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


@pytest.fixture
def client(monkeypatch, tmp_path, _isolate_jin_home):
    try:
        from starlette.testclient import TestClient
    except ImportError:
        pytest.skip("fastapi/starlette not installed")
    import jin_state
    from jin_constants import get_jin_home
    from jin_cli.web_server import app, _SESSION_HEADER_NAME, _SESSION_TOKEN

    monkeypatch.setattr(jin_state, "DEFAULT_DB_PATH", get_jin_home() / "state.db")
    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    (catalog_dir / "alpha-plugin.yaml").write_text(yaml.safe_dump({
        "name": "alpha-plugin", "repo": "https://github.com/example/alpha-plugin", "sha": VALID_SHA,
        "description": "d", "maintainer": "Example", "tier": "official",
        "capabilities": {"provides_tools": ["tool_a"], "requires_env": ["EXAMPLE_API_KEY"]}}))
    (catalog_dir / "removed.yaml").write_text(yaml.safe_dump({"removed": [
        {"name": "bad-plugin", "repo": "https://github.com/evil/bad-plugin", "reason": "exfiltrated env vars"}]}))
    monkeypatch.setattr(pc_cat, "get_catalog_dir", lambda: catalog_dir)
    monkeypatch.setattr(pc_cat, "fetch_live_catalog", lambda **_: None)

    c = TestClient(app)
    c.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
    return c


def _install(name: str, sidecar: dict | None):
    """A user-dir plugin; *sidecar* records catalog provenance the way the installer does — on the
    installer-owned ``.install-metadata.json`` record (an in-tree ``.jin-catalog.json`` is inert)."""
    from jin_constants import get_jin_home
    from jin_cli.plugins_cmd import _read_install_metadata, _write_install_metadata
    d = get_jin_home() / "plugins" / name
    d.mkdir(parents=True)
    (d / "plugin.yaml").write_text(yaml.safe_dump({"name": name, "version": "1.0", "description": "x"}))
    if sidecar:
        block = {"name": sidecar["catalog_name"], "sha": sidecar["sha"], "tier": sidecar.get("tier", "community")}
        _write_install_metadata({**_read_install_metadata(), name: {
            "pinned": True, "revision": sidecar["sha"], "source": "https://github.com/example/alpha-plugin.git",
            "catalog": block}})


def test_catalog_endpoint_merges_installed_state_from_sidecar(client):
    from starlette.testclient import TestClient
    from jin_cli.web_server import app
    assert TestClient(app).get("/api/dashboard/plugins/catalog").status_code == 401

    # Manifest name differs from the catalog name (the common case): matched through the sidecar.
    _install("alpha", {"catalog_name": "alpha-plugin", "sha": OTHER_SHA, "tier": "official"})
    data = client.get("/api/dashboard/plugins/catalog").json()
    [entry] = data["entries"]
    assert (entry["name"], entry["sha_short"], entry["capabilities"]["provides_tools"]) == ("alpha-plugin", VALID_SHA[:7], ["tool_a"])
    assert "tool_a" in entry["capability_summary"]
    assert (entry["installed"], entry["installed_sha"], entry["update_available"]) == (True, OTHER_SHA, True)
    assert entry["runtime_status"] == "inactive"
    assert data["removed"][0]["reason"] == "exfiltrated env vars"


def test_install_endpoint_refuses_removed_plugins_with_no_bypass(client, monkeypatch):
    from jin_cli import plugins_cmd
    monkeypatch.setattr(plugins_cmd, "_install_plugin_core", lambda *a, **k: pytest.fail("kill-listed install ran"))
    for body in ({"identifier": "https://github.com/evil/bad-plugin.git"},
                 {"identifier": "", "catalog_name": "bad-plugin"}, {"identifier": "evil/bad-plugin"}):
        resp = client.post("/api/dashboard/agent-plugins/install", json=body)
        assert resp.status_code == 400, body
        assert "removed" in resp.json()["detail"] or "not in the Jin plugin catalog" in resp.json()["detail"]
    assert client.post("/api/dashboard/agent-plugins/install", json={"identifier": ""}).status_code == 400

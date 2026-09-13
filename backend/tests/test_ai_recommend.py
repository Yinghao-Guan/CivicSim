"""The AI trust boundary.

These tests never call OpenAI. They drive the endpoint with stand-in model
replies to prove the parts that matter: the model cannot introduce a number,
cannot name something the simulation does not have, and cannot take the rest
of the demo down with it.
"""

import pytest
from fastapi.testclient import TestClient

import main
from ai import fallback
from ai.planner import PlannerUnavailable, Recommendation
from data.demo_neighborhood import build_demo_cohort, build_demo_graph, site
from main import app
from simulation.scenarios import evaluate_scenario


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def fake_model(monkeypatch):
    """Replace the model call with a scripted reply."""

    def use(reply):
        def _recommend(goal, evidence, **kwargs):
            if isinstance(reply, Exception):
                raise reply
            use.seen = {"goal": goal, "evidence": evidence}
            return reply

        monkeypatch.setattr(main.planner, "recommend", _recommend)

    use.seen = None
    return use


def a_reply(site_id="site_b", action="none", summary="s", tradeoff="t"):
    return Recommendation(
        recommended_site=site_id,
        summary=summary,
        tradeoff=tradeoff,
        suggested_action=action,
    )


# --- the evidence is the simulation's, not the model's ----------------------


def test_evidence_comes_from_the_deterministic_run(client, fake_model):
    fake_model(a_reply())
    expected = evaluate_scenario(build_demo_graph(), build_demo_cohort(), site("site_c"))

    body = client.post("/ai/recommend", json={"goal": "reach the most people"}).json()

    site_c = next(e for e in body["evidence"] if e["site_id"] == "site_c")
    assert site_c["metrics"]["population_reached"] == expected.metrics.population_reached
    assert site_c["metrics"]["wheelchair_access"] == pytest.approx(
        expected.metrics.wheelchair_access
    )


def test_every_candidate_is_included_as_evidence(client, fake_model):
    fake_model(a_reply())

    body = client.post("/ai/recommend", json={"goal": "anything"}).json()

    assert [e["site_id"] for e in body["evidence"]] == ["site_a", "site_b", "site_c"]


def test_the_model_is_shown_the_real_metrics(client, fake_model):
    fake_model(a_reply())

    client.post("/ai/recommend", json={"goal": "reduce heat"})

    sent = fake_model.seen["evidence"]
    assert {e["site_id"] for e in sent} == {"site_a", "site_b", "site_c"}
    assert all("metrics" in e for e in sent)


def test_response_carries_no_model_supplied_numbers(client, fake_model):
    """The schema the model fills has no numeric fields at all."""
    fake_model(a_reply())

    body = client.post("/ai/recommend", json={"goal": "anything"}).json()

    assert set(Recommendation.model_fields) == {
        "recommended_site",
        "summary",
        "tradeoff",
        "suggested_action",
    }
    assert set(body) == {
        "recommended_site",
        "summary",
        "tradeoff",
        "suggested_action",
        "evidence",
        "model",
        # Provenance, set by the backend rather than the model.
        "source",
        "captured_at",
    }


# --- bounded outputs --------------------------------------------------------


def test_unknown_site_cannot_be_selected():
    """The enum blocks it at parse time, before it can ever reach the API."""
    with pytest.raises(Exception):
        Recommendation(
            recommended_site="site_z",
            summary="s",
            tradeoff="t",
            suggested_action="none",
        )


def test_unknown_action_cannot_be_selected():
    with pytest.raises(Exception):
        Recommendation(
            recommended_site="site_b",
            summary="s",
            tradeoff="t",
            suggested_action="demolish_the_freeway",
        )


def test_shade_suggested_for_the_wrong_site_is_dropped(client, fake_model):
    """Shade exists only for Site B; offering it elsewhere is not honoured."""
    fake_model(a_reply(site_id="site_c", action="add_site_b_shade"))

    body = client.post("/ai/recommend", json={"goal": "cooler please"}).json()

    assert body["recommended_site"] == "site_c"
    assert body["suggested_action"] == "none"


def test_shade_survives_when_site_b_is_recommended(client, fake_model):
    fake_model(a_reply(site_id="site_b", action="add_site_b_shade"))

    body = client.post("/ai/recommend", json={"goal": "cooler please"}).json()

    assert body["suggested_action"] == "add_site_b_shade"


# --- failure is contained ---------------------------------------------------


def test_planner_failure_is_a_503_ai_unavailable(client, fake_model):
    fake_model(PlannerUnavailable("OPENAI_API_KEY is not set"))

    response = client.post("/ai/recommend", json={"goal": "anything"})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "ai_unavailable"


def test_a_broken_assistant_leaves_the_simulation_working(client, fake_model):
    """The demo must survive the AI being down."""
    fake_model(PlannerUnavailable("no key"))
    assert client.post("/ai/recommend", json={"goal": "x"}).status_code == 503

    assert client.get("/baseline").status_code == 200
    assert client.post("/simulate", json={"cooling_center": "site_c"}).status_code == 200
    assert client.get("/scenario/site_b").status_code == 200


def test_empty_goal_is_rejected(client):
    assert client.post("/ai/recommend", json={"goal": ""}).status_code == 422


def test_overlong_goal_is_rejected(client):
    assert client.post("/ai/recommend", json={"goal": "x" * 501}).status_code == 422


def test_missing_api_key_reports_unavailable(monkeypatch):
    """Exercised through the real planner, with no key present."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from ai import planner

    with pytest.raises(PlannerUnavailable, match="OPENAI_API_KEY"):
        planner.recommend("anything", [{"site_id": "site_a"}])


def test_a_refusal_is_reported_as_unavailable():
    """`output_parsed` is None on refusal; nothing trustworthy to show."""
    from ai import planner

    class RefusingClient:
        class responses:  # noqa: N801 - mirrors the SDK's shape
            @staticmethod
            def parse(**kwargs):
                return type("R", (), {"output_parsed": None})()

    with pytest.raises(PlannerUnavailable):
        planner.recommend("anything", [{"site_id": "site_a"}], client=RefusingClient())


# --- numbers stay simulation-owned ------------------------------------------


class _ScriptedClient:
    """Returns prepared replies in order, recording the instructions sent."""

    def __init__(self, replies):
        self._replies = list(replies)
        self.instructions = []
        outer = self

        class responses:  # noqa: N801 - mirrors the SDK's shape
            @staticmethod
            def parse(**kwargs):
                outer.instructions.append(kwargs["input"][0]["content"])
                reply = outer._replies.pop(0)
                return type("R", (), {"output_parsed": reply})()

        self.responses = responses


def test_prose_with_a_figure_is_detected():
    from ai import planner

    assert planner.prose_carries_numbers(a_reply(summary="Reaches 3,240 residents."))
    assert planner.prose_carries_numbers(a_reply(tradeoff="Only 10% get an route."))
    assert not planner.prose_carries_numbers(
        a_reply(summary="Reaches the most residents.", tradeoff="Worse for wheelchairs.")
    )


def test_a_numeric_answer_is_retried_once_and_the_clean_one_kept():
    from ai import planner

    scripted = _ScriptedClient(
        [
            a_reply(summary="Site B reaches 1,640 residents."),
            a_reply(summary="Site B reaches the most residents nearby."),
        ]
    )

    result = planner.recommend("anything", [{"site_id": "site_b"}], client=scripted)

    assert result.summary == "Site B reaches the most residents nearby."
    assert len(scripted.instructions) == 2
    assert "no digits at all" in scripted.instructions[1]


def test_a_persistently_numeric_answer_is_refused():
    """Two strikes and the answer is discarded rather than displayed."""
    from ai import planner

    scripted = _ScriptedClient(
        [
            a_reply(summary="Reaches 1,640 residents."),
            a_reply(tradeoff="Serves only 89.5% of wheelchair users."),
        ]
    )

    with pytest.raises(PlannerUnavailable, match="figures"):
        planner.recommend("anything", [{"site_id": "site_b"}], client=scripted)


def test_a_numeric_answer_never_reaches_the_api(client, monkeypatch):
    """End to end: the endpoint reports unavailable rather than showing it."""
    from ai import planner

    scripted = _ScriptedClient(
        [a_reply(summary="Reaches 1,640."), a_reply(summary="Still 1,640.")]
    )
    # Captured first: `main.planner` is this module, so calling the patched
    # name would recurse.
    real_recommend = planner.recommend
    monkeypatch.setattr(
        main.planner,
        "recommend",
        lambda goal, evidence, **kw: real_recommend(goal, evidence, client=scripted),
    )

    response = client.post("/ai/recommend", json={"goal": "anything"})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "ai_unavailable"


# --- cached fallback --------------------------------------------------------


def test_live_answers_are_marked_live(client, fake_model):
    fake_model(a_reply())

    body = client.post("/ai/recommend", json={"goal": "anything at all"}).json()

    assert body["source"] == "live"
    assert body["captured_at"] is None


@pytest.mark.parametrize("goal", list(fallback.preset_goals()))
def test_every_preset_falls_back_when_the_assistant_is_down(client, fake_model, goal):
    fake_model(PlannerUnavailable("network unreachable"))

    response = client.post("/ai/recommend", json={"goal": goal})

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "cached"
    assert body["captured_at"] == fallback.CAPTURED_AT
    assert body["model"] == fallback.CAPTURED_MODEL
    assert body["recommended_site"] in {"site_a", "site_b", "site_c"}


def test_cached_replies_still_get_fresh_simulation_evidence(client, fake_model):
    """The cache holds no numbers; evidence is computed for the request."""
    fake_model(PlannerUnavailable("network unreachable"))
    expected = evaluate_scenario(build_demo_graph(), build_demo_cohort(), site("site_c"))

    body = client.post(
        "/ai/recommend", json={"goal": fallback.preset_goals()[0]}
    ).json()

    site_c = next(e for e in body["evidence"] if e["site_id"] == "site_c")
    assert site_c["metrics"]["population_reached"] == expected.metrics.population_reached
    assert [e["site_id"] for e in body["evidence"]] == ["site_a", "site_b", "site_c"]


def test_the_cache_stores_no_metric_values():
    for entry in fallback.CACHED.values():
        assert set(vars(entry)) == {
            "goal",
            "recommended_site",
            "summary",
            "tradeoff",
            "suggested_action",
        }


def test_cached_prose_passes_the_same_digit_guard():
    from ai import planner

    for entry in fallback.CACHED.values():
        assert not planner.prose_carries_numbers(entry.as_recommendation())


def test_cached_entries_use_only_supported_sites_and_actions():
    for entry in fallback.CACHED.values():
        # Constructing the Recommendation re-validates both enums.
        rec = entry.as_recommendation()
        assert rec.recommended_site in {"site_a", "site_b", "site_c"}
        assert rec.suggested_action in {"none", "add_site_b_shade"}


def test_free_text_does_not_fall_back(client, fake_model):
    """No guessing: an unseen goal keeps the unavailable state."""
    fake_model(PlannerUnavailable("network unreachable"))

    response = client.post(
        "/ai/recommend", json={"goal": "put it next to my house please"}
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "ai_unavailable"


def test_a_near_miss_preset_does_not_fall_back(client, fake_model):
    """Close is not a match; only the exact preset text falls back."""
    fake_model(PlannerUnavailable("network unreachable"))
    almost = fallback.preset_goals()[0].replace("as possible", "as we can")

    assert client.post("/ai/recommend", json={"goal": almost}).status_code == 503


def test_fallback_is_not_used_while_the_model_works(client, fake_model):
    """The cache is for failure only, never a shortcut."""
    fake_model(a_reply(site_id="site_a", summary="live words", tradeoff="live cost"))

    body = client.post(
        "/ai/recommend", json={"goal": fallback.preset_goals()[0]}
    ).json()

    assert body["source"] == "live"
    assert body["summary"] == "live words"


def test_core_endpoints_still_work_in_fallback_mode(client, fake_model):
    fake_model(PlannerUnavailable("network unreachable"))
    assert client.post(
        "/ai/recommend", json={"goal": fallback.preset_goals()[1]}
    ).status_code == 200

    assert client.get("/baseline").status_code == 200
    assert client.post("/simulate", json={"cooling_center": "site_b"}).status_code == 200


# --- prewarm is harmless ----------------------------------------------------


def test_prewarm_without_a_key_reports_false_and_does_not_raise(monkeypatch):
    from ai import planner

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(planner, "_cached_client", None)

    assert planner.prewarm() is False


def test_default_model_is_the_benchmarked_one():
    from ai import planner

    assert planner.DEFAULT_MODEL == "gpt-5.6-terra"


def test_model_stays_configurable(monkeypatch):
    from ai import planner

    monkeypatch.setenv("OPENAI_MODEL", "gpt-6-astra")
    assert planner.model_name() == "gpt-6-astra"
    monkeypatch.delenv("OPENAI_MODEL")
    assert planner.model_name() == planner.DEFAULT_MODEL


def test_existing_endpoints_are_unchanged_by_the_ai_layer(client):
    """Contract section 19 is additive."""
    assert client.get("/baseline").status_code == 200
    assert client.post("/simulate", json={"cooling_center": "site_b"}).status_code == 200
    assert client.get("/scenario/baseline").status_code == 200
    assert client.post("/simulate", json={"cooling_center": "site_x"}).status_code == 400

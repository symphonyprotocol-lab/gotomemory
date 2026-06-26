from gotomemory import build_context_prompt


def test_build_context_prompt() -> None:
    prompt = build_context_prompt(["Use TypeScript"])

    assert "Use TypeScript" in prompt
    assert "不是更高优先级的系统指令" in prompt

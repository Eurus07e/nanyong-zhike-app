from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_support_dialog_discloses_payment_processor_and_recipient() -> None:
    source = (ROOT / "frontend" / "src" / "components" / "About.tsx").read_text(
        encoding="utf-8"
    )

    assert "付款由支付宝处理" in source
    assert "Euros(**轩)" in source
    assert "不影响任何功能" in source

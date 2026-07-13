import pytest

from backend.app.exchange_system import (
    ExchangeSystemError,
    _valid_login_url,
    parse_academic_ranking,
)


PAGE = """
<div class="layui-row xmbm_row">
  <div class="layui-col-md4">
    <div class="xm_label">平均学分绩</div>
    <div class="xm_text_span"><span>4.56</span></div>
  </div>
  <!-- The old page still contains an unrendered, commented rank input. -->
  <!--<input name="data.zypm" value="${data.zypm}">-->
  <div class="layui-col-md4">
    <div class="xm_label">本专业总人数</div>
    <div class="xm_text"><input disabled name="data.zyzrs" value="262"></div>
  </div>
  <div class="layui-col-md4">
    <div class="xm_label">排名百分比</div>
    <div class="xm_text"><input disabled name="data.pmbfb" value="8.78%"></div>
  </div>
</div>
"""


def test_parse_academic_ranking_recovers_integer_rank():
    summary = parse_academic_ranking(PAGE)

    assert summary.as_dict() == {
        "averageScore": 4.56,
        "rank": 23,
        "majorTotal": 262,
        "rankPercent": 8.78,
    }


def test_parse_academic_ranking_rounds_rank_half_up():
    page = PAGE.replace('value="262"', 'value="40"').replace(
        'value="8.78%"', 'value="6.25%"'
    )

    assert parse_academic_ranking(page).rank == 3


def test_parse_academic_ranking_rejects_missing_values():
    with pytest.raises(ExchangeSystemError, match="暂未返回"):
        parse_academic_ranking('<div class="xm_label">平均学分绩</div>')


def test_login_url_must_stay_on_nju_authserver():
    assert _valid_login_url(
        "https://authserver.nju.edu.cn/authserver/login?"
        "service=http%3A%2F%2Felite.nju.edu.cn%2Fexchangesystem%2Findex%2Fcreate%3Fpid%3D4"
    )
    assert not _valid_login_url("https://example.com/authserver/login")
    assert not _valid_login_url(
        "https://authserver.nju.edu.cn/authserver/login?"
        "service=https%3A%2F%2Fexample.com%2Fcollect-ticket"
    )

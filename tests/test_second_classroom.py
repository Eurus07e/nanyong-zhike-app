from backend.app.second_classroom import parse_second_classroom_profile


def test_parses_second_classroom_profile_without_auth_material() -> None:
    html = '''
      <label>学号</label><input value="251000000" disabled>
      <label>姓名</label><input value="测试同学" disabled>
      <label>年级</label><input value="2025" disabled>
      <label>学院</label><input value="新生学院" disabled>
      <label>电子邮箱</label><input value="student@smail.nju.edu.cn">
      <label>服务总时长</label><input value="44.5" disabled>
      <label>参加活动数</label><input value="4" disabled>
      <label>不诚信记录</label><input value="0" disabled>
      <select name="data.yyjn"><option value="10">无</option><option value="14">四级</option></select>
      <select name="data.qtyy"><option value="10">无</option><option value="20">粤语</option></select>
      <select name="data.qtjn"><option value="0">无</option><option value="1">急救</option></select>
      <script>var yyjn = "10"; var qtyy = "20"; var qtjn = "1";</script>
    '''
    result = parse_second_classroom_profile(html, fetched_at=1)
    assert result == {
        "fetchedAt": 1, "studentId": "251000000", "name": "测试同学",
        "grade": "2025", "college": "新生学院", "email": "student@smail.nju.edu.cn",
        "englishLevel": "无", "otherLanguages": "粤语", "otherSkills": "急救", "activityCount": 4,
        "serviceHours": 44.5, "dishonestyCount": 0,
        "sourceUrl": "https://youth.nju.edu.cn/tw/",
    }
    assert "CASTGC" not in repr(result)

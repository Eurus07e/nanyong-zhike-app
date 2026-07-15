import assert from 'node:assert/strict'
import test from 'node:test'

import { selectOwnedProgram } from '../src/utils.ts'

test('academic overview selects the authenticated major instead of another browsed program', () => {
  const programs = [
    { PYFADM: 'other', PYFAMC: '2025级物理学主修培养方案', ZYDM: '0702', ZYDM_DISPLAY: '物理学', DWDM: 'physics', DWDM_DISPLAY: '物理学院', XDLXDM_DISPLAY: '主修' },
    { PYFADM: 'owned', PYFAMC: '2025级智能科学与技术主修培养方案', ZYDM: '761', ZYDM_DISPLAY: '智能科学与技术', DWDM: '400760', DWDM_DISPLAY: '智能科学与技术学院', XDLXDM_DISPLAY: '主修' },
  ]
  const profile = {
    grade: '2025',
    majorCode: '761',
    majorName: '智能科学与技术',
    departmentCode: '400760',
    departmentName: '智能科学与技术学院',
  }

  assert.equal(selectOwnedProgram(programs, profile)?.PYFADM, 'owned')
})

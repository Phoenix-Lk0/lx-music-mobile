/*!
 * @name 链路自测源
 * @description 不提供任何音频，仅用于验证音源库的下载与安装流程
 * @version 1.0.0
 * @author OTBOT
 * @homepage https://github.com/{{GH_OWNER}}/{{GH_REPO}}
 */
/* eslint-disable */
const sources = {
  test: {
    name: '链路自测',
    type: 'music',
    actions: [],
    qualitys: [],
  },
}

lx.send('inited', { status: true, sources })

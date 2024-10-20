import md5 from 'md5'
import lodash from 'lodash'
import Tools from '../model/index.js'

export class bbsVerification extends plugin {
  constructor(e) {
    super({
      name: 'GT-Manual-Plugin',
      priority: -(9 ** 9),
      namespace: 'GT-Manual-Plugin',
      handler: [
        {
          dsc: 'mys请求错误处理',
          key: 'mys.req.err',
          fn: 'mysReqErrHandler'
        }
      ],
      rule: [
        {
          dsc: '米游社手动签到',
          reg: '^#*(原神|星铁|米游社)?签到$',
          fnc: 'sign'
        },
        {
          dsc: '重新连接WebSocket',
          reg: '^#GT重连ws$',
          fnc: 'reconnection',
          permission: 'master'
        },
        {
          dsc: '刷新米游社验证',
          reg: '^#米游社验证$',
          fnc: 'bbsVerify'
        }
      ]
    })
  }

  async mysReqErrHandler(e, options, reject) {
    let { mysApi, type, data } = options
    let retcodeError = [1034, 5003, 10035]
    let cfg = Tools.Cfg

    if (
      !retcodeError.includes(options.res.retcode) ||
      cfg.blackList.includes(e.user_id) ||
      !(cfg.verify && cfg.verifyAddr) ||
      (cfg.verify == 3 && !e.isSr) ||
      (cfg.verify == 2 && e.isSr)
    ) return reject()

    /** isVerify */
    if (e.isVerify) return await mysApi.getData(type, data)

    mysApi.getUrl = (...args) => this.getUrl.apply(mysApi, args)

    let verify = await Tools.bbsVerification(e, mysApi)
    if (!verify) logger.error(`[米游社验证失败][uid:${e.uid || mysApi.uid}][qq:${e.user_id}]`)

    if (options.OnlyGtest) return verify

    if (verify) {
      // await e.reply('已重新获取米游社验证，请重新执行命令', true)
      await e.reply('过码成功，等待重新获取数据。')
      await this.sleep(1000);
      return await mysApi.getData(type, data)
    } else {
      return options.res;
    }

    // return verify ? await mysApi.getData(type, data) : options.res
  }

  /**
   * 休眠函数
   * @param ms 毫秒
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  getUrl(type, data = {}) {
    let urlMap = {
      ...this.apiTool.getUrlMap({ ...data, deviceId: this.device }),
      createVerification: {
        url: 'https://bbs-api.miyoushe.com/misc/wapi/createVerification',
        query: 'gids=2&is_high=false'
      },
      verifyVerification: {
        url: 'https://bbs-api.miyoushe.com/misc/wapi/verifyVerfication',
        body: data
      }
    }
    if (!urlMap[type]) return false

    let { url, query = '', body = '' } = urlMap[type]

    if (query) url += `?${query}`
    if (body) body = JSON.stringify(body)

    let headers = this.getHeaders(query, body)
    // if (this.isSr != 0) headers['x-rpc-challenge_game'] = '6'
    if (this.isSr) {
      app_key = 'hkrpg_game_record'
      headers['x-rpc-challenge_game'] = '6'
    }
    else if (this.isZzz) {
      app_key = 'game_record_zzz'
      headers['x-rpc-challenge_game'] = '8'
    }

    return { url, headers, body }
  }

  async sign(e) {
    let { sign, signAddr } = Tools.Cfg
    if (!(sign && signAddr)) return false

    let key = `${+new Date()}`
    if (!Tools.ws) {
      Tools.connectWebSocket();
      await new Promise((resolve) => {
        Tools.ws.onopen = () => {
          console.log('连接成功');
          resolve();
        };
      });
      if (!Tools.ws) {
        console.log('连接失败');
        return false;
      }
    }

    this.mysUsers = this.mysUsers || {}
    Tools.mysUsers = this.mysUsers
    Tools.MysUser = e.runtime.MysUser
    let user = await e.runtime.NoteUser.create(e.user_id)
    if (!user.hasCk) {
      await e.reply('请先绑定cookie', true)
      return
    }
    this.mysUsers[key] = user.mysUsers
    let payload = this.getUidsData(key, e.user_id)
    let { link } = await Tools.socketSend('createUser', payload, key)
    if (link) await e.reply(`签到地址: ${link}`)
  }

  getUidsData(key, user_id) {
    let uids = []
    let mysUsers = this.mysUsers[key]
    lodash.forEach(mysUsers, ds => {
      for (let game of ['gs', 'sr', 'zzz']) {
        ds.getUids(game).forEach(uid => uids.push(ds.getUidData(uid, game)))
      }
    })
    return uids
  }

  async reconnection(e) {
    Tools.connectWebSocket()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    e.reply(Tools.ws ? '重连成功~' : '重连失败~')
  }

  async bbsVerify(e) {
    let user = await e.runtime.NoteUser.create(e.user_id)
    let mysUser = user.getMysUser()
    if (!user.hasCk) {
      await e.reply('请先绑定cookie', true)
      return
    }
    let mysApi = new Tools.MysApi(mysUser.uid, mysUser.ck)
    let verify = await Tools.bbsVerification(e, mysApi)
    if (!verify) {
      await e.reply('米游社验证失败!', true)
      logger.error(`[米游社验证失败][uid:${mysApi.uid}][qq:${e.user_id}]`)
      return
    }
    await e.reply('米游社验证成功!', true)
  }
}

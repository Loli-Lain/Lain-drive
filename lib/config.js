import Yaml from 'yaml'
import fs from 'node:fs'
import moment from 'moment'
import chokidar from 'chokidar'

/** 配置文件 */
class Cfg {
  constructor () {
    this._path = './config/'
    this.config = {}

    /** 监听文件 */
    this.watcher = { config: {}, defSet: {} }

    this.initCfg()
    this.CreateFolder()
  }

  /** 初始化配置 */
  initCfg () {
    this.path = this._path + '/config/'
    this.pathDef = this._path + '/defSet/'
    const files = fs.readdirSync(this.pathDef).filter(file => file.endsWith('.yaml'))
    for (let file of files) {
      if (!fs.existsSync(`${this.path}${file}`)) {
        fs.copyFileSync(`${this.pathDef}${file}`, `${this.path}${file}`)
      }
    }
    if (!fs.existsSync('data')) fs.mkdirSync('data')
  }

  /** 日志等级 */
  get log_level () {
    let defSet = this.getdefSet('config')
    let config = this.getConfig('config')
    return { ...defSet, ...config }.log_level
  }

  /** 请求token */
  get token () {
    let defSet = this.getdefSet('config')
    let config = this.getConfig('config')
    return { ...defSet, ...config }.token
  }

  /** HTTP服务器端口 */
  get port () {
    let defSet = this.getdefSet('config')
    let config = this.getConfig('config')
    return { ...defSet, ...config }.port
  }

  /** 上传文件的过期时间 */
  get ExpirationTime () {
    let defSet = this.getdefSet('config')
    let config = this.getConfig('config')
    return { ...defSet, ...config }.ExpirationTime
  }

  /** 404路径 */
  get File404 () {
    let defSet = this.getdefSet('config')
    let config = this.getConfig('config')
    return { ...defSet, ...config }.File404
  }

  /** baseUrl */
  get baseUrl () {
    let defSet = this.getdefSet('config')
    let config = this.getConfig('config')
    return { ...defSet, ...config }.baseUrl
  }

  /** ffmpeg_path */
  get ffmpeg_path () {
    let defSet = this.getdefSet('config')
    let config = this.getConfig('config')
    return { ...defSet, ...config }.ffmpeg_path
  }

  /**
   * @param name 配置文件名称
   */
  getdefSet (name) {
    return this.getYaml('defSet', name)
  }

  /** 用户配置 */
  getConfig (name) {
    return this.getYaml('config', name)
  }

  /**
   * 获取配置yaml
   * @param type 默认跑配置-defSet，用户配置-config
   * @param name 名称
   */
  getYaml (type, name) {
    let file = `${this._path}/${type}/${name}.yaml`
    let key = `${type}.${name}`
    if (this.config[key]) return this.config[key]

    this.config[key] = Yaml.parse(
      fs.readFileSync(file, 'utf8')
    )

    this.watch(file, name, type)

    return this.config[key]
  }

  /** 监听配置文件 */
  watch (file, name, type = 'defSet') {
    let key = `${type}.${name}`

    if (this.watcher[key]) return

    const watcher = chokidar.watch(file)
    watcher.on('change', path => {
      delete this.config[key]
      if (typeof Bot == 'undefined') return
      logger.mark(`[修改配置文件][${type}][${name}]`)
      if (this[`change_${name}`]) {
        this[`change_${name}`]()
      }
    })

    this.watcher[key] = watcher
  }

  /** 创建文件夹 */
  CreateFolder () {
    const todayFolder = './File/' + moment().format('YYYY-MM-DD')
    const tomorrowFolder = './File/' + moment().add(1, 'days').format('YYYY-MM-DD')

    try {
      !fs.existsSync(todayFolder) && fs.mkdirSync(todayFolder)
      !fs.existsSync(tomorrowFolder) && fs.mkdirSync(tomorrowFolder)
      return true
    } catch (error) {
      console.error('创建文件夹错误', error)
      return false
    }
  }
}

export default new Cfg()

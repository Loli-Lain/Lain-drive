import './lib/init.js'
import fs from 'fs'
import http from 'http'
import multer from 'multer'
import crypto from 'crypto'
import express from 'express'
import moment from 'moment'
import fetch from 'node-fetch'
import sizeOf from 'image-size'
import { promisify } from 'util'
import schedule from 'node-schedule'
import { fileTypeFromBuffer } from 'file-type'
import { exec as execCb } from 'child_process'
import { encode as encodeSilk } from 'silk-wasm'
import Cfg from './lib/config.js'
import db from './model/index.js'

const exec = promisify(execCb)

class Server {
  constructor () {
    /** 文件基本路径 */
    this.File = `./File/${moment().format('YYYY-MM-DD')}/`
    /** 启动HTTP服务器 */
    this.server()
    /** 定时任务 创建文件夹 */
    schedule.scheduleJob('0 0 * * *', () => Cfg.CreateFolder())
    /** 定时任务 更新缓存路径 */
    schedule.scheduleJob('0 0 * * *', () => {
      this.File = `./File/${moment().format('YYYY-MM-DD')}/`
    })
    /** 定时任务 每天凌晨4点执行一次 删除访问次数低的文件 */
    schedule.scheduleJob('0 4 * * *', () => {
      try {
        db.Files.File.findAll().then(files => {
          if (!files.length) return logger.mark('[定时任务]数据库不存在任何文件信息')
          files.forEach(file => {
            if (file.usageCount < 10) {
              fs.promises.unlink(file.path).catch(error => logger.error(`[定时任务]删除文件 ${file.name} 出错:`, error.message))
              file.destroy().catch(error => logger.error(`[定时任务]删除数据库记录 ${file.name} 出错:`, error.message))
            }
          })
        })
      } catch (error) {
        logger.error('定时任务执行出错:', error.message)
      }
    })
  }

  async server () {
    const app = express()

    /** 处理multipart/form-data请求 */
    const upload = multer({ storage: multer.memoryStorage() })
    /** 设置静态路径 */
    app.use('/static', express.static(process.cwd() + '/File'))

    /** Get请求 返回文件 */
    app.get('/api/File/:filename', async (req, res) => await this.getRep(req, res))

    /** Get请求 返回文件 */
    app.get('/api/MD5/:md5', async (req, res) => await this.getRep(req, res, 'md5'))

    /** Get请求 删除文件 */
    app.get('/api/del/:md5', async (req, res) => {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null
      const token = req.headers.token || null
      const md5 = req.params.md5
      this.log(false, true, ip, token, `删除:${md5}`)
      const file = await db.Files.getMD5(md5)
      try {
        if (file) {
          fs.unlinkSync(file.path)
          await file.destroy()
          return res.status(200).json({ message: '删除成功' })
        }
        return res.status(400).json({ error: '文件不存在' })
      } catch (error) {
        logger.error(error)
        return res.status(400).json({ error: '文件不存在' })
      }
    })

    /** POST请求 接收文件 */
    app.post('/api/upload', upload.single('file'), async (req, res) => {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null
      const token = req.headers.token || null

      this.log(true, true, ip, token)

      if (!token || !Cfg.token.includes(token)) {
        this.log(true, false, ip, token, 'message:token错误', true)
        return res.status(500).json({ status: 'failed', message: 'token错误' })
      }

      /** 是否符合要求 */
      const fileType = req.file ? 'file' : req.body.mp3 ? 'mp3' : req.body.link ? 'link' : null
      if (!fileType) {
        this.log(true, false, ip, token, 'message:文件类型错误')
        return res.status(400).json({ error: '文件类型错误' })
      }

      switch (fileType) {
        /** 文件，直接存本地即可 */
        case 'file':
          return await this.bufferFile(res, token, ip, req.file.buffer)
        /** 通过此接口上传的，均为需要转码 */
        case 'mp3':
          return await this.MP3File(res, token, ip, req.file.buffer)
        /** 传递link，使用此配置，请求头必须设置文件类型 支持file、mp3，图片视频和silk均可传递file */
        case 'link':
          if (!req.headers.type) {
            /** 存请求纪录 */
            db.Post.post({ ip, token, type: fileType, time: Date.now(), error: '未传递文件类型' })
            return res.status(400).json({ error: '未传递文件类型' })
          }
          /** 存请求纪录 */
          db.Post.post({ ip, token, type: fileType, time: Date.now(), link: req.body.link })
          return await this.linkFile(res, token, ip, req.body.link, req.headers.type)
        default:
          this.log(true, false, ip, token, 'message:未传递文件类型')
          /** 存请求纪录 */
          db.Post.post({ ip, token, type: fileType, time: Date.now(), error: '未传递文件类型' })
          return res.status(400).json({ error: '未传递文件类型' })
      }
    })

    http.createServer(app, '0.0.0.0').listen(Cfg.port, () => logger.mark(`HTTP服务器已启动：${Cfg.baseUrl || `http://127.0.0.1:${Cfg.port})`}`))
  }

  /** get请求 */
  async getRep (req, res, type) {
    const ip = req.ip
    const { token } = req.query
    const url = req.originalUrl

    this.log(false, true, ip, token, `url:${url}`)
    /** 存请求纪录 */
    db.Get.get({ ip, token, time: Date.now(), url })

    /** token错误 */
    if (!token || !Cfg.token.includes(token)) {
      this.log(false, false, ip, token, 'message:token错误', true)
      return res.status(500).json({ status: 'failed', message: 'token错误' })
    }

    /** 拿对应的key查数据库 */
    let data
    if (type === 'md5') {
      data = await db.Files.getMD5(req.params.md5)
    } else {
      data = await db.Files.getName(req.params.filename)
    }

    /** 文件不存在 */
    if (!data) {
      this.log(false, false, ip, token, 'message:文件不存在')
      return res.status(400).json({ error: '文件不存在' })
    }
    const { md5, mime, path } = data

    /** 存请求纪录 */
    db.Files.FileCount(md5)

    try {
      /** 设置响应头 */
      res.setHeader('Content-Type', mime || 'application/octet-stream')
      res.setHeader('Content-Disposition', 'inline')

      this.log(false, false, ip, token, `MD5:${md5}> => <mime:${mime}> => <path:${path}`)
      return fs.createReadStream(path).pipe(res)
    } catch (error) {
      logger.error(error)
      return res.status(400).json({ status: 'failed', message: '未知错误' })
    }
  }

  /** buffer */
  async bufferFile (res, token, ip, buffer) {
    try {
      /** 取文件基本信息 */
      const File = await this.FileData(buffer)

      /** 拿MD5查数据库 */
      const data = await db.Files.getMD5(File.md5)

      /** 拿到了直接返回即可 */
      if (data) return await this.returnPost(res, token, ip, data)

      /** 没拿到存本地文件、数据库 */
      this.SaveFile({ ...File, ip, token }, buffer)

      /** 返回 */
      return await this.returnPost(res, token, ip, File)
    } catch (error) {
      logger.error(error)
      return res.status(500).json({ status: 'failed', message: '未知错误' })
    }
  }

  /** MP3 */
  async MP3File (res, token, ip, buffer) {
    try {
      /** 拿MP3的文件信息 */
      let mp3 = await this.FileData(buffer)

      /** 存请求纪录 */
      db.Post.post({ ip, token, type: 'mp3', time: Date.now(), md5: mp3.md5 })

      /** 拿MD5查数据库 */
      const mp3File = await db.Files.getMD5(mp3.md5)

      /** 拿到了直接返回即可 */
      if (mp3File) return await this.returnPost(res, token, ip, mp3File)

      /** 转码 */
      const { ok, data } = await this.getAudio(buffer)

      if (!ok) {
        this.log(true, false, ip, token, 'message:转码失败', true)
        return res.status(400).json({ error: '转码失败' })
      }

      /** 获取转码后的文件信息 */
      const silk = await this.FileData(data)
      /** 保存mp3的文件信息 */
      this.SaveFile({ ...silk, md5: mp3.md5, ip, token }, buffer, false)
      /** 保存转码后的文件信息 */
      this.SaveFile({ ...silk, ip, token }, data)
      /** 返回 */
      return await this.returnPost(res, token, ip, silk)
    } catch (error) {
      logger.error(error)
      return res.status(500).json({ status: 'failed', message: '未知错误' })
    }
  }

  /** link */
  async linkFile (res, token, ip, link, type) {
    try {
      /** 先下载成为buffer 随后根据不同分配 */
      let buffer = Buffer.from(await (await fetch(link)).arrayBuffer())
      if (type === 'mp3') return await this.MP3File(res, token, ip, buffer)
      return await this.bufferFile(res, token, ip, buffer)
    } catch (error) {
      logger.error(error)
      return res.status(500).json({ status: 'failed', message: '未知错误' })
    }
  }

  /** 获取文件信息 */
  async FileData (buffer) {
    const size = buffer.length
    const md5 = crypto.createHash('md5').update(buffer).digest('hex')
    let image = { width: 0, height: 0 }
    try { image = sizeOf(buffer) } catch { }
    const { width, height } = image
    const { mime, ext } = await this.getType(buffer)
    const arr = mime.split('/')
    /** 文件名称 */
    const name = `${md5}-${size}-${width}-${height}-${arr[0]}-${arr[1]}.${ext}`
    /** 文件路径 */
    const path = `${this.File}${name}`

    return {
      size,
      md5,
      width,
      height,
      mime,
      ext,
      name,
      path
    }
  }

  /** 获取文件后缀、mime */
  async getType (buffer) {
    try {
      const { mime, ext } = await fileTypeFromBuffer(buffer)
      return { mime, ext }
    } catch (error) {
      return { mime: 'application/octet-stream', ext: 'txt' }
    }
  }

  /** 语音云转码 */
  async getAudio (file) {
    const _path = process.cwd() + '/data/'
    const mp3 = _path + `${Date.now()}.mp3`
    const pcm = _path + `${Date.now()}.pcm`

    /** buffer转mp3 */
    fs.writeFileSync(mp3, file)
    /** mp3 转 pcm */
    await this.runFfmpeg(mp3, pcm)
    logger.mark('mp3 => pcm 完成!')
    logger.mark('pcm => silk 进行中!')

    try {
      /** pcm 转 silk */
      let data = await encodeSilk(fs.readFileSync(pcm), 48000)
      data = Buffer.from(data?.data || data)
      logger.mark('pcm => silk 完成!')
      /** 删除初始mp3文件 */
      fs.promises.unlink(mp3, () => { })
      /** 删除pcm文件 */
      fs.promises.unlink(pcm, () => { })
      return { ok: true, data }
    } catch (error) {
      logger.error(error)
      return { ok: false, data: error }
    }
  }

  /** ffmpeg转码 转为pcm */
  async runFfmpeg (input, output) {
    let cm
    let stdout
    try { stdout = await exec('ffmpeg -version', { windowsHide: true }) } catch { }
    cm = stdout?.stdout ? 'ffmpeg' : (Cfg.ffmpeg_path || null)
    if (!cm) throw new Error('未检测到 ffmpeg ，无法进行转码，请正确配置环境变量或手动前往 config.yaml 进行配置')
    try {
      await exec(`${cm} -i "${input}" -f s16le -ar 48000 -ac 1 "${output}"`)
    } catch (error) {
      logger.error(`执行错误: ${error}`)
      throw error
    }
  }

  /** 保存文件并记录到数据库 */
  SaveFile (data, buffer, save = true) {
    save && fs.writeFileSync(data.path, buffer)
    /** 存数据库 */
    db.Files.addFileRecord(data)
  }

  /** 文件处理完成后，post请求返回 */
  async returnPost (res, token, ip, data) {
    try {
      data = {
        size: data.size,
        md5: data.md5,
        width: data.width,
        height: data.height,
        mime: data.mime,
        ext: data.ext,
        name: data.name,
        path: data.path,
        url: Cfg.baseUrl.replace(/\/$/, '') + `/api/File/${data.name}?token=${token}`
      }

      this.log(true, false, ip, token, `link:${data.url}`)
      return res.status(200).json(data)
    } catch (error) {
      logger.error(error)
      return res.status(500).json({ status: 'failed', message: '未知错误' })
    }
  }

  /**
   * 打印请求、响应日志
   * @param {boolean} type - 指定请求类型，传入 true 表示 POST 请求，传入 false 表示 GET 请求
   * @param {boolean} action - 指定日志动作，传入 true 表示接收日志，传入 false 表示返回日志
   * @param {string} ip - 请求的 IP 地址
   * @param {string} token - 请求的令牌信息
   * @param {string} message - 自定义日志内容
   */
  log (type, action, ip, token, message, error) {
    /** 箭头 */
    const p = action ? '->' : '=>'
    let log = `<${type ? 'post' : 'get'}:${action ? '接收' : '响应'}> ${p} <ip:${ip}> ${p} <token:${token}>${message ? ` ${p} <${message}` : ''}>`

    /** 接收请求使用info等级日志 */
    if (action) return error ? logger.error(log) : logger.info(log)

    /** post请求使用绿色 */
    if (type) return error ? logger.error(log) : logger.mark(logger.green(log))
    /** get请求使用紫色 */
    return error ? logger.error(log) : logger.mark(logger.purple(log))
  }
}

export default new Server()

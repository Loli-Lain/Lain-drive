import { exec as execCb } from 'child_process'
import crypto from 'crypto'
import express from 'express'
import { fileTypeFromBuffer } from 'file-type'
import fs from 'fs'
import http from 'http'
import sizeOf from 'image-size'
import multer from 'multer'
import { encode as encodeSilk } from 'silk-wasm'
import { promisify } from 'util'
import Cfg from './lib/config.js'
import './lib/init.js'

const exec = promisify(execCb)

class Server {
  constructor () {
    /** 临时文件 */
    this.File = new Map()
    /** 启动HTTP服务器 */
    this.server()
  }

  async server () {
    const app = express()

    /** 处理multipart/form-data请求 */
    const upload = multer({ storage: multer.memoryStorage() })
    /** 设置静态路径 */
    app.use('/static', express.static(process.cwd() + '/data'))

    /** POST请求 接收文件 */
    app.post('/api/upload', upload.single('file'), async (req, res) => {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null
      const token = req.headers.token || null

      logger.info(`<post:接收> -> <ip:${ip}> -> <token:${token}>`)

      if (!token || token !== Cfg.token) {
        logger.error(`<post:返回> => <ip:${ip}> => <token:${token}> => <message:token错误>`)
        return res.status(500).json({ status: 'failed', message: 'token错误' })
      }

      /** 是否符合要求 */
      const fileType = req.file ? 'file' : req.body.mp3 ? 'mp3' : req.body.link ? 'link' : null
      if (!fileType) {
        logger.error(`<post:返回> => <ip:${ip}> => <token:${token}> => <message:文件类型错误>`)
        return res.status(400).json({ error: '文件类型错误' })
      }

      switch (fileType) {
        /** 文件，直接存本地即可 */
        case 'file':
          return await this.returnPost(res, token, ip, req.file.buffer)
        /** 通过此接口上传的，均为需要转码 */
        case 'mp3':
          return await this.MP3File(res, token, ip, req.file.buffer)
        /** 传递link，使用此配置，请求头必须设置文件类型 支持file、mp3，图片视频和silk均可传递file */
        case 'link':
          if (!req.headers.type) return res.status(400).json({ error: '未传递文件类型' })
          return await this.linkFile(res, token, ip, req.body.link, req.headers.token)
        default:
          logger.error(`<post:返回> => <ip:${ip}> => <token:${token}> => <message:文件类型错误>`)
          return res.status(400).json({ error: '文件类型错误' })
      }
    })

    /** Get请求 返回文件 */
    app.get('/api/File/:filename', async (req, res) => {
      const File = process.cwd() + `/temp/${req.params.filename}`
      const ip = req.ip
      const { token } = req.query

      logger.info(`<get:接收> -> <ip:${ip}> -> <token:${token}>`)

      /** token错误 */
      if (!token || token !== Cfg.token) {
        logger.error(`<get:返回> => <ip:${ip}> => <token:${token}> => <message:token错误>`)
        return res.status(500).json({ status: 'failed', message: 'token错误' })
      }

      /** 文件不存在 */
      if (!fs.existsSync(File)) {
        logger.error(`<get:返回> => <ip:${ip}> => <token:${token}> => <message:文件不存在>`)
        return res.status(400).json({ error: '文件不存在' })
      }

      /** 设置响应头 */
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', 'inline')
      logger.mark(logger.green(`<get:返回> => <ip:${ip}> => <File:${File}>`))
      return fs.createReadStream(File).pipe(res)
    })

    http.createServer(app, '0.0.0.0').listen(Cfg.port, () => logger.info(`HTTP服务器已启动：${Cfg.baseUrl || `http://127.0.0.1:${Cfg.port})`}`))
  }

  /** post请求成功返回 */
  async returnPost (res, token, ip, buffer) {
    try {
      /** 取文件基本信息 */
      const data = await this.FileData(buffer)
      const _path = `./temp/${data.name}`
      /** 本地没有就保存 */
      if (!fs.existsSync(_path)) fs.writeFileSync(_path, buffer)
      data.url = Cfg.baseUrl.replace(/\/$/, '') + `/api/File/${data.name}?token=${token}`
      logger.mark(logger.green(`<post:返回> => <ip:${ip}> => <link:${data.url}>`))
      return res.status(200).json(data)
    } catch (error) {
      logger.error(error)
      return res.status(500).json({ status: 'failed', message: '未知错误' })
    }
  }

  /** MP3 */
  async MP3File (res, token, ip, buffer) {
    try {
      /** 先通过名称看下是否已存在转码好的 */
      const mp3 = await this.FileData(buffer)
      const _path = `./temp/${mp3.name}`
      /** 对于语音，如果本地有就直接返回，没有就需要转码 */
      if (fs.existsSync(_path)) {
        mp3.url = Cfg.baseUrl.replace(/\/$/, '') + `/api/File/${mp3.name}?token=${token}`
        logger.mark(logger.green(`<post:返回> => <ip:${ip}> => <link:${mp3.url}>`))
        return res.status(200).json(mp3)
      }
      /** 转码 */
      const { ok, data } = await this.getAudio(buffer)
      if (!ok) {
        logger.error(`<post:返回> => <ip:${ip}> => <token:${token}> => <message:转码失败>`)
        return res.status(400).json({ error: '转码失败' })
      }
      /** 存一份MP3的md5 下次可通过mp3的md5拿到转码好的 */
      fs.writeFileSync(_path, data)
      /** 随后正常返回即可 */
      return await this.returnPost(res, token, ip, data)
    } catch (error) {
      logger.error(error)
      return res.status(500).json({ status: 'failed', message: '未知错误' })
    }
  }

  /** link */
  async linkFile (res, token, ip, link, type) {
    try {
      /** 先下载成为buffer */
      link = Buffer.from(await (await fetch(link)).arrayBuffer())
      if (type === 'mp3') return await this.MP3File(res, token, ip, link)
      return await this.returnPost(res, token, ip, link)
    } catch (error) {
      logger.error(error)
      return res.status(500).json({ status: 'failed', message: '未知错误' })
    }
  }

  /** 计算文件名称 */
  async FileData (buffer) {
    const size = buffer.length
    const md5 = crypto.createHash('md5').update(buffer).digest('hex')
    let image = { width: 0, height: 0 }
    try { image = sizeOf(buffer) } catch { }
    const { width, height } = image
    const { mime, ext } = await this.getType(buffer)
    const name = `${md5}-${size}-${width}-${height}-${mime}.${ext}`

    return {
      size,
      md5,
      width,
      height,
      mime,
      ext,
      name
    }
  }

  /** 获取文件后缀、mime */
  async getType (buffer) {
    try {
      return await fileTypeFromBuffer(buffer)
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
      fs.unlink(mp3, () => { })
      /** 删除pcm文件 */
      fs.unlink(pcm, () => { })
      return { ok: true, data }
    } catch (error) {
      logger.error(error)
      return { ok: false, data: error }
    }
  }

  /** ffmpeg转码 转为pcm */
  async runFfmpeg (input, output) {
    let cm
    const { stdout } = await exec('ffmpeg -version', { windowsHide: true })
    cm = stdout ? 'ffmpeg' : (Cfg.ffmpeg_path || null)
    if (!cm) throw new Error('未检测到 ffmpeg ，无法进行转码，请正确配置环境变量或手动前往 config.yaml 进行配置')
    try {
      await exec(`${cm} -i "${input}" -f s16le -ar 48000 -ac 1 "${output}"`)
    } catch (error) {
      logger.error(`执行错误: ${error}`)
      throw error
    }
  }
}

export default new Server()

import { Sequelize, DataTypes } from 'sequelize'

/**
 * POST 请求记录模型
 */
class PostRequestLog {
  static init () {
    const sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: './data/db/post.db',
      logging: false
    })

    this.postLog = sequelize.define('PostRequestLog', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
        comment: '自增ID，主键'
      },
      ip: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '上传 IP 地址'
      },
      time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '请求时间戳'
      },
      token: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '请求 Token'
      },
      type: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '文件类型'
      },
      md5: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '文件 MD5 值'
      },
      link: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '文件 link'
      },
      error: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '请求错误'
      }
    })

    sequelize.sync()
  }

  /**
   * 记录 POST 请求
   * @param {object} data - 包含上传 IP、请求时间戳、请求 Token 和文件 MD5 的对象
   * @returns {Promise<boolean>} - 成功时返回 true，失败时返回 false
   */
  static async post (data) {
    try {
      await this.postLog.create(data)
      return true
    } catch (error) {
      logger.error('记录 POST 请求时出错:', error)
      return false
    }
  }
}

/** 初始化数据库 */
PostRequestLog.init()

export default PostRequestLog

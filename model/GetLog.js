import { Sequelize, DataTypes } from 'sequelize'

/**
 * GET 请求记录模型
 */
class GetRequestLog {
  static init () {
    const sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: './data/db/get.db',
      logging: false
    })

    this.GetRequestLog = sequelize.define('GetRequestLog', {
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
        comment: '请求 IP 地址'
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
      url: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '请求 URL'
      }
    })

    sequelize.sync()
  }

  /**
   * 记录 GET 请求
   * @param {object} data - 包含上传 IP、请求时间戳、请求 Token 和请求 URL 的对象
   * @returns {Promise<boolean>} - 成功时返回 true，失败时返回 false
   */
  static async get (data) {
    try {
      await this.GetRequestLog.create(data)
      return true
    } catch (error) {
      logger.error('记录 GET 请求时出错:', error)
      return false
    }
  }
}

/** 加载数据库 */
GetRequestLog.init()

export default GetRequestLog

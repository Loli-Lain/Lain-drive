import { Sequelize, DataTypes } from 'sequelize'

class Files {
  static init () {
    const sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: './data/db/data.db',
      logging: false
    })

    /** 文件模型 */
    this.File = sequelize.define('File', {
      id: {
        /** 整数类型 */
        type: DataTypes.INTEGER,
        /** 自增 */
        autoIncrement: true,
        /** 主键 */
        primaryKey: true,
        /** 禁止为空 */
        allowNull: false,
        /** 描述 */
        comment: '自增ID，主键'
      },
      ip: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '上传 IP 地址'
      },
      token: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '上传者 Token'
      },
      size: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '文件大小'
      },
      md5: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'MD5 值'
      },
      width: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '宽度'
      },
      height: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '高度'
      },
      mime: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'MIME 类型'
      },
      ext: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '文件扩展名'
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '文件名'
      },
      path: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '文件路径'
      },
      usageCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '文件使用次数'
      }
    })

    /** 同步 */
    sequelize.sync()
  }

  /**
    * 添加文件记录到数据库
    * @param {object} fileData - 包含文件相关信息的对象
    * @returns {Promise<boolean>} - 成功时返回 true，失败时返回 false
    */
  static async addFileRecord (fileData) {
    try {
      await this.File.create(fileData)
      return true
    } catch (error) {
      console.error('添加文件记录时出错:', error)
      return false
    }
  }

  /**
 * 根据MD5读取对应信息
 * @param {string} md5 - id
 * @returns {Promise<object>}
 */
  static async getMD5 (md5) {
    try {
      return await this.File.findOne({
        where: { md5 }
      })
    } catch (error) {
      logger.error('获取 MD5 出错', error)
      return null
    }
  }

  /**
* 根据文件名称读取对应信息
* @param {string} name - id
* @returns {Promise<object>}
*/
  static async getName (name) {
    try {
      return await this.File.findOne({
        where: { name }
      })
    } catch (error) {
      logger.error('获取 MD5 出错', error)
      return null
    }
  }

  /**
   * 更新使用次数
   * @param {string} md5 - 用户id
   * @returns {Promise<boolean>} - 成功时返回 true，失败时返回 false
   */

  static async FileCount (md5) {
    try {
      const file = await this.File.findOne({ where: { md5 } })

      /** 不存在此md5 */
      if (!file) return false

      file.usageCount += 1
      await file.save()
      return true
    } catch (error) {
      console.error('更新使用次数时出错:', error)
      return false
    }
  }
}

/** 初始化数据库 */
Files.init()

export default Files

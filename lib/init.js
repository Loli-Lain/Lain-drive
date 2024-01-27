import setLog from './log.js'

/** 日志 */
setLog()

/** 设置标题 */
process.title = 'Lain-drive'

/** 设置时区 */
process.env.TZ = 'Asia/Shanghai'

/** 捕获未处理的错误 */
process.on('uncaughtException', error => {
  if (typeof logger == 'undefined') console.log(error)
  else logger.error(error)
})

/** 捕获未处理的Promise错误 */
process.on('unhandledRejection', (error, promise) => {
  if (typeof logger == 'undefined') console.log(error)
  else logger.error(error)
})
